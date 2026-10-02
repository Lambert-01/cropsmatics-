"""Allow-listed tools.

Each tool answers one narrow question from verified data and returns typed
:class:`~app.ai.evidence.EvidenceItem` objects. Tools call the existing services
rather than reimplementing any statistic, so a figure produced here is the same
figure the structured endpoints produce.

There is deliberately no tool that evaluates an expression, runs SQL, reads an
arbitrary path or executes code. The only operations available are the functions
registered in ``tool_registry``.
"""

from app.ai.tools import context, metadata, productivity

__all__ = ["context", "metadata", "productivity"]
