"""
Rate Limiting Middleware — In-memory, per-user, per-endpoint.
MVP implementation without Redis. Resets on server restart (acceptable for LAN).
"""
import time
from collections import defaultdict
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from jose import jwt
from app.settings import settings


# Rate limit config: {path_prefix: (max_requests, window_seconds)}
RATE_LIMITS = {
    "/bets": (100, 10),
    "/powers": (50, 10),
    "/loans": (20, 10),
}
DEFAULT_LIMIT = (200, 10)

# In-memory store: {(user_id, path_prefix): [timestamps]}
_request_log: dict = defaultdict(list)


def _get_path_prefix(path: str) -> str:
    """Extract the first path segment for rate limit grouping."""
    parts = path.strip("/").split("/")
    if parts:
        return f"/{parts[0]}"
    return "/"


def _extract_user_id(request: Request) -> str:
    """Try to extract user_id from JWT in Authorization header. Falls back to IP."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            token = auth_header[7:]
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
            return f"user_{payload.get('user_id', 'unknown')}"
        except Exception:
            pass
    # Fallback to client IP
    return f"ip_{request.client.host}" if request.client else "ip_unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for non-API routes, health checks, docs
        path = request.url.path
        if path in ("/", "/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)
        
        # Skip WebSocket upgrades
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        identifier = _extract_user_id(request)
        prefix = _get_path_prefix(path)
        max_requests, window = RATE_LIMITS.get(prefix, DEFAULT_LIMIT)
        
        now = time.time()
        key = (identifier, prefix)
        
        # Clean expired entries
        _request_log[key] = [t for t in _request_log[key] if now - t < window]
        
        if len(_request_log[key]) >= max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded: máximo {max_requests} requests cada {window}s para {prefix}",
                    "retry_after_seconds": window,
                },
            )
        
        _request_log[key].append(now)
        return await call_next(request)
