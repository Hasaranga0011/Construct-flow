import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "ConstructFlow API"
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "ConstructFlow <noreply@constructflow.lk>"
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    ANTHROPIC_API_KEY: str = ""
    ENABLE_SCHEDULER: bool = False
    CORS_ORIGINS: str = "http://localhost:8081,http://localhost:8082,http://localhost:19006,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:8082"
    # Optional SMTP settings for direct email delivery
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_USE_TLS: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
