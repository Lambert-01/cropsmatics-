"""Typed application settings.

Values are loaded from environment variables and from ``.env`` files.

Three sources are consulted, in increasing order of precedence:

1. ``<repo root>/.env`` - the single project-wide environment file
2. ``<current working directory>/.env`` - an optional service-local override
3. real environment variables - always win (this is what production uses)

Reading the repo-root file matters: the API is normally started from
``services/api``, so a CWD-relative lookup would silently miss the project
``.env`` and fall back to the localhost defaults.

See ``.env.example`` at the repository root for every supported key.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# services/api/app/core/config.py -> repo root is parents[4].
REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Later entries take precedence, so a service-local .env can override the
        # project one during development. Real environment variables still win
        # over every file (that is pydantic-settings' default source order).
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- app ---
    project_name: str = "Cropmatics Rwanda"
    version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "info"
    api_v1_prefix: str = "/api/v1"

    # --- security ---
    jwt_secret: str = Field(default="change-me", min_length=1)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # --- db ---
    database_url: str = "postgresql+psycopg://cropmatics:cropmatics@localhost:5432/cropmatics"

    # --- cors --- (comma-separated string; exposed as a list via property to
    # avoid pydantic-settings JSON-decoding complex types from the environment)
    cors_origins: str = "http://localhost:3000"

    # --- data ---
    data_raw_dir: str = "data/raw"
    data_processed_dir: str = "data/processed"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def raw_dir(self) -> Path:
        p = Path(self.data_raw_dir)
        return p if p.is_absolute() else REPO_ROOT / p

    @property
    def processed_dir(self) -> Path:
        p = Path(self.data_processed_dir)
        return p if p.is_absolute() else REPO_ROOT / p

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (import-safe, testable via cache_clear)."""
    return Settings()
