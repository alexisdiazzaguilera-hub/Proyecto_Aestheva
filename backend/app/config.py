from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    clinic_secret: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg no acepta sslmode=require — usa ssl=require
        url = url.replace("?sslmode=require", "?ssl=require")
        return url

    class Config:
        env_file = ".env"


settings = Settings()
