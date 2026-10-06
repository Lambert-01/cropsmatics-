"""Prompt guidance for depth and audience, shared by every provider path.

Keeping this in one place is what makes the two ways a provider can answer - the
free-generation path and the agent tool-calling path - word the *same* depth and
audience the same way. A guide duplicated in two files drifts, and the drift is
invisible until a user notices the assistant answers differently depending on
which provider is configured.

The guides change **presentation only**. They never permit a new figure: the
numeric guard and the evidence contract are unaffected by anything here.
"""

from __future__ import annotations

DEPTH_GUIDE: dict[str, str] = {
    "quick": (
        "Answer in 2-3 sentences. Give the direct answer and at most two key "
        "figures. No methodology."
    ),
    "standard": (
        "Answer in a short paragraph followed by a few bullet findings. Include "
        "the important figures and note what they do not show."
    ),
    "deep": (
        "Give a thorough answer: a summary, key findings, the numbers that matter, "
        "a comparison or trend where relevant, interpretation, and the limitations "
        "of the data. Still use only figures present in the EVIDENCE block."
    ),
}

AUDIENCE_GUIDE: dict[str, str] = {
    "farmer": (
        "Write for a farmer: plain everyday language, short sentences, practical "
        "meaning first. Avoid statistical jargon and avoid long caveats, but never "
        "drop the honest limitation that these are aggregate observations."
    ),
    "planner": (
        "Write for a district planner: emphasise comparisons, priorities, trend "
        "and coverage. Be concrete about which districts or periods are involved."
    ),
    "analyst": (
        "Write for a researcher: state units, coverage, the comparison basis and "
        "the statistical caution. Refer to associations as associations, never as "
        "causes. You may mention methodology."
    ),
}

#: Output-token multiplier by depth, applied to the provider's configured budget.
DEPTH_TOKEN_MULTIPLIER: dict[str, float] = {
    "quick": 0.5,
    "standard": 1.0,
    "deep": 2.0,
}


def token_budget(base: int, depth: str | None) -> int:
    """Scale the configured output budget for the requested depth.

    Clamped to a sane ceiling so a ``deep`` request cannot run the bill away.
    """
    multiplier = DEPTH_TOKEN_MULTIPLIER.get((depth or "standard").lower(), 1.0)
    return max(64, min(int(base * multiplier), 4096))


def guidance(depth: str | None, audience: str | None) -> str:
    """A short instruction block for the requested depth and audience."""
    lines: list[str] = []
    depth_key = (depth or "standard").lower()
    if depth_key in DEPTH_GUIDE:
        lines.append(f"DEPTH ({depth_key}): {DEPTH_GUIDE[depth_key]}")
    audience_key = (audience or "planner").lower()
    if audience_key in AUDIENCE_GUIDE:
        lines.append(f"AUDIENCE ({audience_key}): {AUDIENCE_GUIDE[audience_key]}")
    return "\n".join(lines)
