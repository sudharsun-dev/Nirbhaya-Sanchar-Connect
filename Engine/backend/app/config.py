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

    # CORS Allowed Origins
    CORS_ORIGINS: str = "https://nirbhaya-sanchar-connect-vv3g.vercel.app,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,*"

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # System 1 Integration
    SYSTEM1_BASE_URL: str = "https://nirbhaya-connect-server.onrender.com"
    SYSTEM1_API_KEY: Optional[str] = "nirbhaya_system1_api_key_2026"
    SYSTEM1_CALLBACK_URL: str = "https://nirbhaya-connect-server.onrender.com/api/nirbhaya/callback"
    SYSTEM1_CALLBACK_SECRET: Optional[str] = "nirbhaya_system1_api_key_2026"

    # AI Models Metadata & Settings
    VOICE_MODEL_PROVIDER: str = "AASIST"
    VOICE_MODEL_NAME: str = "AASIST"
    VOICE_MODEL_VERSION: str = "ASVspoof2019-LA"
    VOICE_MODEL_PATH: Optional[str] = "models/AASIST.pth"
    VOICE_MODEL_LICENSE: str = "MIT / NAVER Corp (Clova AI)"
    VOICE_DETECTION_API_KEY: Optional[str] = None
    VOICE_DETECTION_API_URL: Optional[str] = None

    # Speech To Text (ASR)
    ASR_PROVIDER: str = "Nirbhaya MultiLang ASR / Whisper API"
    ASR_MODEL: str = "whisper-base-multilingual"
    ASR_API_KEY: Optional[str] = None
    ASR_API_URL: Optional[str] = None

    # Speaker Identity
    SPEAKER_MODEL: str = "ECAPA-TDNN / Acoustic Spectral Vector"
    SPEAKER_MODEL_PATH: Optional[str] = None

    # Auth & Security
    JWT_SECRET: str = "nirbhaya_secret_key_change_in_production_2026_safe"
    INTERNAL_API_KEY: str = "nirbhaya_internal_api_key_2026"

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
