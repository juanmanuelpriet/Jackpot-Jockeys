from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    APP_ENV: str = "dev"
    PROJECT_NAME: str = "Jackpot Jockeys API"
    JWT_SECRET: str = "dev_secret_change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Database
    DB_URL: str = "postgresql+psycopg://jackpot:jackpot_pass@db:5432/jackpotjockeys"

    # CORS
    CORS_ORIGINS: str = "*"

    # Economy Config
    MAX_POWER_SPEND_PER_RACE: float = 300.0
    POWER_COST_SCALING: float = 1.25
    CANCEL_FEE: float = 0.05
    RAKE_PCT: float = 0.10
    MAX_BET_PER_MARKET: float = 500.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
