import os
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "NIRBHAYA_SANCHAR_ENGINE"
    ENVIRONMENT: str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nirbhaya_engine.db"
    REDIS_URL: Optional[str] = None

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
            url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return url

    # CORS Allowed Origins
    CORS_ORIGINS: str = (
        "https://nirbhaya-sanchar-connect-gik8.vercel.app,"
        "https://nirbhaya-sanchar-connect-vv3g.vercel.app,"
        "https://nirbhaya-sanchar-connect.onrender.com,"
        "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        defaults = [
            "https://nirbhaya-sanchar-connect-gik8.vercel.app",
            "https://nirbhaya-sanchar-connect-vv3g.vercel.app",
            "https://nirbhaya-sanchar-connect.onrender.com",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174"
        ]
        if not self.CORS_ORIGINS or self.CORS_ORIGINS == "*":
            return defaults
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip() and origin.strip() != "*"]
        for d in defaults:
            if d not in origins:
                origins.append(d)
        return origins

    # System 1 Integration
    SYSTEM1_BASE_URL: str = "https://nirbhaya-connect-server.onrender.com"
    SYSTEM1_API_KEY: Optional[str] = os.getenv("SYSTEM1_API_KEY")
    SYSTEM1_CALLBACK_URL: str = "https://nirbhaya-connect-server.onrender.com/api/nirbhaya/callback"
    SYSTEM1_CALLBACK_SECRET: Optional[str] = os.getenv("SYSTEM1_CALLBACK_SECRET")

    @property
    def resolved_system1_base_url(self) -> str:
        url = self.SYSTEM1_BASE_URL or ""
        if not url or (("localhost" in url or "127.0.0.1" in url) and self.ENVIRONMENT == "production"):
            return "https://nirbhaya-connect-server.onrender.com"
        return url

    @property
    def resolved_system1_callback_url(self) -> str:
        url = self.SYSTEM1_CALLBACK_URL or ""
        if not url or (("localhost" in url or "127.0.0.1" in url) and self.ENVIRONMENT == "production"):
            return "https://nirbhaya-connect-server.onrender.com/api/nirbhaya/callback"
        return url

    # AI Models Metadata & Settings
    VOICE_MODEL_PROVIDER: str = "AASIST"
    VOICE_MODEL_NAME: str = "AASIST"
    VOICE_MODEL_VERSION: str = "ASVspoof2019-LA"
    VOICE_MODEL_PATH: Optional[str] = "models/AASIST.pth"
    VOICE_MODEL_LICENSE: str = "MIT / NAVER Corp (Clova AI)"
    VOICE_DETECTION_API_KEY: Optional[str] = None
    VOICE_DETECTION_API_URL: Optional[str] = None

    # Resemble AI Streaming Deepfake Detection
    RESEMBLE_API_KEY: Optional[str] = os.getenv("RESEMBLE_API_KEY")
    RESEMBLE_STREAM_URL: str = os.getenv("RESEMBLE_STREAM_URL", "wss://stream.resemble.ai/api/v1/detect/audio")

    @property
    def is_resemble_configured(self) -> bool:
        return bool(self.RESEMBLE_API_KEY and len(self.RESEMBLE_API_KEY.strip()) > 5 and not self.RESEMBLE_API_KEY.startswith("YOUR_"))

    # Speech To Text (ASR)
    ASR_PROVIDER: str = "Nirbhaya MultiLang ASR / Whisper API"
    ASR_MODEL: str = "whisper-base-multilingual"
    ASR_API_KEY: Optional[str] = None
    ASR_API_URL: Optional[str] = None

    # Speaker Identity
    SPEAKER_MODEL: str = "ECAPA-TDNN / Acoustic Spectral Vector"
    SPEAKER_MODEL_PATH: Optional[str] = None

    # Auth & Security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "nirbhaya_dev_jwt_secret_token_2026")
    INTERNAL_API_KEY: Optional[str] = os.getenv("INTERNAL_API_KEY")

    # Alerts & Notifications
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMS_PROVIDER: Optional[str] = None
    SMS_API_KEY: Optional[str] = None

    # Storage
    STORAGE_PROVIDER: str = "local"
    STORAGE_BUCKET: str = "nirbhaya_audio_temp"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
