from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.settings import settings
from app.api import auth, wallet, markets, bets, powers, admin, loans
from app.ws import router as ws_router
from app.core.rate_limiter import RateLimitMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.2.0",
)

# Rate limiting (must be added before CORS so it runs after CORS in the chain)
app.add_middleware(RateLimitMiddleware)

# CORS
origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix="/auth")
app.include_router(wallet.router)
app.include_router(markets.router)
app.include_router(bets.router)
app.include_router(powers.router)
app.include_router(admin.router)
app.include_router(loans.router)
app.include_router(ws_router.router)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Jackpot Jockeys API",
        "status": "online",
        "version": "0.2.0"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
