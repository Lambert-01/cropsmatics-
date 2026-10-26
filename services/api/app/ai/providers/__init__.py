"""Provider selection.

The choice comes from backend configuration only, and the deterministic provider
is always the fallback. There is no configuration in which Cropmatics cannot
answer: a remote provider that is disabled, misconfigured, slow or wrong degrades
to the same published-evidence answer the platform has always given.
"""

from __future__ import annotations

from app.ai.providers.base import LLMProvider, ProviderUnavailable
from app.ai.providers.deterministic import DeterministicProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.remote import (
    GroqProvider,
    RemoteConfig,
    RemoteProvider,
    load_config,
    load_gemini_config,
)

DETERMINISTIC = DeterministicProvider()


def get_provider(config: RemoteConfig | None = None) -> LLMProvider:
    """The provider to use for a request.

    Returns the remote provider only when it is explicitly enabled *and* fully
    configured; otherwise the deterministic provider.
    """
    selected = config or load_config()
    if selected.provider == "gemini":
        provider: LLMProvider = GeminiProvider(selected)
    elif selected.provider == "groq":
        provider = GroqProvider(selected)
    else:
        provider = RemoteProvider(selected)
    return provider if provider.available() else DETERMINISTIC


def get_provider_chain(config: RemoteConfig | None = None) -> list[LLMProvider]:
    """Return primary, optional Gemini secondary, then deterministic fallback.

    The secondary is explicit and independent of the primary. This means a
    quota outage at Groq can degrade to Gemini when configured, while a normal
    deployment with no Gemini key keeps one deterministic fallback only.
    """
    primary = get_provider(config)
    providers: list[LLMProvider] = []
    if primary.name != DETERMINISTIC.name:
        providers.append(primary)

    secondary = GeminiProvider(load_gemini_config())
    if secondary.available() and all(item.name != secondary.name for item in providers):
        providers.append(secondary)
    providers.append(DETERMINISTIC)
    return providers


def fallback_provider() -> LLMProvider:
    """The provider that answers when the selected one fails."""
    return DETERMINISTIC


async def provider_status() -> dict:
    """Public-safe AI status. Contains no credential and no raw error text."""
    remote = get_provider()
    secondary = GeminiProvider(load_gemini_config())
    return {
        "selected": remote.name,
        "fallback_available": True,
        "fallback_provider": DETERMINISTIC.name,
        "primary": await remote.health(),
        "secondary": await secondary.health(),
        # Keep the old key for clients that display the previous status shape.
        "remote": await remote.health(),
    }


__all__ = [
    "DETERMINISTIC",
    "DeterministicProvider",
    "GeminiProvider",
    "GroqProvider",
    "LLMProvider",
    "ProviderUnavailable",
    "RemoteConfig",
    "RemoteProvider",
    "fallback_provider",
    "get_provider",
    "get_provider_chain",
    "load_config",
    "load_gemini_config",
    "provider_status",
]
