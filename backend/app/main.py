from app.settings import settings
from app.api import auth, wallet, markets, bets, powers, admin
from app.ws import router as ws_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
)

# Set up CORS
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
app.include_router(bets.router)
app.include_router(powers.router)
app.include_router(admin.router)
app.include_router(ws_router.router)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Jackpot Jockeys API",
        "status": "online",
        "version": "0.1.0"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
