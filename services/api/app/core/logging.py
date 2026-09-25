"""Logging setup kept intentionally simple and dependency-free."""

from __future__ import annotations

import logging
import sys

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # Never log the secret material even if a lib tries to.
    logging.getLogger("uvicorn.error").setLevel(level)
