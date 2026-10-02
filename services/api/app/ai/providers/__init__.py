"""Provider selection.

The choice comes from backend configuration only, and the deterministic provider
is always the fallback. There is no configuration in which Cropmatics cannot
answer: a remote provider that is disabled, misconfigured, slow or wrong degrades
to the same published-evidence answer the platform has always given.
"""

from __future__ import annotations

from app.ai.providers.base import LLMProvider, ProviderUnavailable
from app.ai.providers.deterministic import DeterministicProvider
from app.ai.providers.remote import RemoteConfig, RemoteProvider, load_config

DETERMINISTIC = DeterministicProvider()


def get_provider(config: RemoteConfig | None = None) -> LLMProvider:
    """The provider to use for a request.

    Returns the remote provider only when it is explicitly enabled *and* fully
    configured; otherwise the deterministic provider.
    """
    remote = RemoteProvider(config or load_config())
    return remote if remote.available() else DETERMINISTIC


def fallback_provider() -> LLMProvider:
    """The provider that answers when the selected one fails."""
    return DETERMINISTIC


async def provider_status() -> dict:
    """Public-safe AI status. Contains no credential and no raw error text."""
    remote = RemoteProvider()
    return {
        "selected": get_provider().name,
        "fallback_available": True,
        "fallback_provider": DETERMINISTIC.name,
        "remote": await remote.health(),
    }


__all__ = [
    "DETERMINISTIC",
    "DeterministicProvider",
    "LLMProvider",
    "ProviderUnavailable",
    "RemoteConfig",
    "RemoteProvider",
    "fallback_provider",
    "get_provider",
    "load_config",
    "provider_status",
]
