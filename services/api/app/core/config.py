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
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# How the analytical read paths resolve their data.
#
#   required  - PostgreSQL must be ready. Readiness fails otherwise and no
#               production request is answered from the processed files.
#   preferred - PostgreSQL first; an explicit, *reported* fallback to the
#               processed files when the database cannot serve the request.
#   file      - processed files only. Development/testing only.
#
# Production defaults to ``required`` so a deploy can never quietly serve stale
# CSV artefacts while claiming canonical authority. See ``canonical_mode``.
CanonicalDataMode = Literal["required", "preferred", "file"]
CANONICAL_DATA_MODES: tuple[str, ...] = ("required", "preferred", "file")

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
    # Optional override; when unset the mode is derived from `environment` below.
    canonical_data_mode: str | None = None

    # --- grounded assistant protection -------------------------------------
    # These limits are process-local by default. A multi-instance deployment
    # should point the same limiter seam at Redis for a global quota.
    ai_rate_limit_requests: int = 60
    ai_rate_limit_window_seconds: int = 60
    ai_rate_limit_max_keys: int = 10_000
    ai_trust_proxy_headers: bool = False

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """Accept the bare ``postgresql://`` scheme that dashboards emit.

        Neon and Render copy connection strings as ``postgresql://...``.
        SQLAlchemy maps that bare scheme to the psycopg2 driver, which this
        service does not ship (it uses psycopg 3), so the engine would fail at
        import time with ``ModuleNotFoundError: psycopg2`` and the API could
        not start at all. Rewriting the scheme keeps a dashboard-pasted URL
        working without requiring operators to know the driver-specific form.
        """
        url = (value or "").strip()
        for prefix in ("postgres://", "postgresql://", "postgresql+psycopg2://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @field_validator("canonical_data_mode")
    @classmethod
    def _validate_canonical_data_mode(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        mode = str(value).strip().lower()
        if mode not in CANONICAL_DATA_MODES:
            raise ValueError(
                f"CANONICAL_DATA_MODE must be one of {CANONICAL_DATA_MODES}, got {value!r}"
            )
        return mode

    @property
    def canonical_mode(self) -> CanonicalDataMode:
        """Effective canonical data mode.

        An explicit ``CANONICAL_DATA_MODE`` always wins. Otherwise production
        requires the database and everything else may fall back to files, so a
        fresh clone and CI keep working without a PostgreSQL instance.
        """
        if self.canonical_data_mode is not None:
            return self.canonical_data_mode  # type: ignore[return-value]
        return "required" if self.is_production else "preferred"

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
