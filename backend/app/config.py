import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    """Raised when required configuration is missing."""


@dataclass(frozen=True)
class Settings:
    api_key: str
    cors_origins: list[str]
    db_path: str
    version: str

    @classmethod
    def from_env(cls) -> "Settings":
        api_key = os.environ.get("API_KEY", "").strip()
        if not api_key:
            raise ConfigError(
                "API_KEY is required. Set it in the `environment` section of docker-compose.yml."
            )
        cors_origins = [
            origin.strip()
            for origin in os.environ.get("CORS_ORIGINS", "").split(",")
            if origin.strip()
        ]
        db_path = os.environ.get("DB_PATH", "/app/data/habits.sqlite")
        version = os.environ.get("APP_VERSION", "dev")
        return cls(
            api_key=api_key,
            cors_origins=cors_origins,
            db_path=db_path,
            version=version,
        )
