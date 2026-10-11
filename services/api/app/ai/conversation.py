"""Multi-turn conversation state.

The assistant is a conversation, not a sequence of unrelated lookups. This module
holds the state that makes a follow-up coherent:

    USER  Tell me about maize in Gisagara in 2026B.
    USER  What about beans?            -> inherit Gisagara + 2026B, replace crop
    USER  Compare them.                -> maize vs beans, from the recent crops
    USER  What about previous Season B?-> resolve the prior same season
    USER  Explain that in Kinyarwanda. -> same evidence, new language

Design constraints, all deliberate:

* **Bounded.** A conversation keeps at most ``max_turns`` turns and a fixed
  number of conversations, with a TTL. This is a cache, not a database, so it can
  never grow without limit and a stale conversation simply expires.
* **Entity-only.** The state stores *which* crop, district and period were being
  discussed - never a value. Context inheritance can therefore narrow what is
  looked up but can never inject a figure into a grounded answer.
* **Compacted.** A stored turn carries the question, the resolved intent and its
  entities plus a short excerpt of the answer - not the whole answer and not the
  evidence bundle. Sending an unbounded transcript to a provider is how cost and
  latency quietly explode, so the transcript exposed to a provider is capped too.
* **Process-local.** State is in-memory by default. A single API worker keeps a
  coherent conversation; a multi-worker deployment would move this to Redis
  without changing the call sites (``STORE`` is the only seam).
"""

from __future__ import annotations

import threading
import time

from pydantic import BaseModel, Field

#: A conversation remembers this many turns; older turns are dropped.
MAX_TURNS = 8

#: Characters of an answer kept per turn. Enough to recognise "that", not enough
#: to grow the state with full prose.
MAX_EXCERPT_CHARS = 240

#: Distinct crops remembered as "recently discussed", used to resolve "compare
#: them" after the active crop has moved on.
MAX_RECENT_CROPS = 4

#: Whole-store bounds.
MAX_CONVERSATIONS = 500
TTL_SECONDS = 60 * 60 * 2


class ConversationTurn(BaseModel):
    """One compacted exchange. Entity-only; no figures are stored."""

    question: str
    intent: str
    crops: list[str] = Field(default_factory=list)
    districts: list[str] = Field(default_factory=list)
    period_code: str | None = None
    excerpt: str | None = None


class ConversationContext(BaseModel):
    """The entities carried into the next turn.

    ``crops`` is the *active* crop set; ``recent_crops`` also keeps crops that
    were discussed earlier, so "compare them" still has both sides after the
    active crop has changed.
    """

    language: str = "en"
    depth: str = "standard"
    audience: str = "planner"
    crops: list[str] = Field(default_factory=list)
    recent_crops: list[str] = Field(default_factory=list)
    districts: list[str] = Field(default_factory=list)
    period_code: str | None = None
    metric: str | None = None
    last_intent: str | None = None

    def fingerprint(self) -> dict:
        """The safe projection returned to a client as ``resolved_context``."""
        return {
            "crops": list(self.crops),
            "districts": list(self.districts),
            "period_code": self.period_code,
            "metric": self.metric,
            "language": self.language,
            "depth": self.depth,
            "audience": self.audience,
            "last_intent": self.last_intent,
        }


class ConversationState(BaseModel):
    conversation_id: str
    created_at: float
    updated_at: float
    context: ConversationContext
    turns: list[ConversationTurn] = Field(default_factory=list)

    def transcript(self, *, limit: int = 4) -> list[dict]:
        """A bounded, entity-only transcript safe to show a provider.

        Deliberately excludes old evidence: the current turn's evidence is the
        only thing a provider may quote, and a stale figure in the transcript
        could be mistaken for current.
        """
        return [
            {
                "question": turn.question,
                "intent": turn.intent,
                "crops": turn.crops,
                "districts": turn.districts,
                "period_code": turn.period_code,
            }
            for turn in self.turns[-limit:]
        ]


def _dedupe_append(existing: list[str], added: list[str], *, limit: int) -> list[str]:
    out = [value for value in existing if value]
    for value in added:
        if value and value not in out:
            out.append(value)
    return out[-limit:]


class ConversationStore:
    """Bounded, process-local conversation store.

    Every mutation prunes the TTL-expired entries first, so the store cannot grow
    past ``max_conversations`` even under a burst of new conversations.
    """

    def __init__(
        self,
        *,
        max_conversations: int = MAX_CONVERSATIONS,
        ttl_seconds: int = TTL_SECONDS,
        max_turns: int = MAX_TURNS,
    ) -> None:
        self._states: dict[str, ConversationState] = {}
        self._lock = threading.Lock()
        self._max_conversations = max_conversations
        self._ttl = ttl_seconds
        self._max_turns = max_turns

    def _prune(self, now: float) -> None:
        expired = [key for key, state in self._states.items() if now - state.updated_at > self._ttl]
        for key in expired:
            self._states.pop(key, None)
        if len(self._states) > self._max_conversations:
            # Drop the oldest conversations first.
            ordered = sorted(self._states.items(), key=lambda item: item[1].updated_at)
            for key, _ in ordered[: len(self._states) - self._max_conversations]:
                self._states.pop(key, None)

    def get(self, conversation_id: str | None) -> ConversationState | None:
        if not conversation_id:
            return None
        now = time.time()
        with self._lock:
            self._prune(now)
            state = self._states.get(conversation_id)
            if state is None:
                return None
            if now - state.updated_at > self._ttl:
                self._states.pop(conversation_id, None)
                return None
            return state

    def create(self, conversation_id: str) -> ConversationState:
        now = time.time()
        state = ConversationState(
            conversation_id=conversation_id,
            created_at=now,
            updated_at=now,
            context=ConversationContext(),
        )
        with self._lock:
            self._states[conversation_id] = state
            # Prune *after* inserting so the store is never briefly over its cap.
            self._prune(now)
        return state

    def get_or_create(self, conversation_id: str | None) -> ConversationState:
        if conversation_id:
            existing = self.get(conversation_id)
            if existing is not None:
                return existing
            return self.create(conversation_id)
        import uuid

        return self.create(uuid.uuid4().hex)

    def record_turn(
        self,
        state: ConversationState,
        *,
        question: str,
        intent: str,
        crops: list[str],
        districts: list[str],
        period_code: str | None,
        language: str,
        depth: str,
        audience: str,
        answer: str,
    ) -> None:
        """Fold a completed turn into the conversation state."""
        excerpt = (answer or "").strip()
        if len(excerpt) > MAX_EXCERPT_CHARS:
            excerpt = excerpt[:MAX_EXCERPT_CHARS].rstrip() + "…"

        turn = ConversationTurn(
            question=question,
            intent=intent,
            crops=list(crops),
            districts=list(districts),
            period_code=period_code,
            excerpt=excerpt or None,
        )

        context = state.context
        context.language = language
        context.depth = depth
        context.audience = audience
        context.crops = list(crops)
        context.districts = list(districts)
        context.period_code = period_code
        context.last_intent = intent
        context.recent_crops = _dedupe_append(
            context.recent_crops, crops, limit=MAX_RECENT_CROPS
        )

        now = time.time()
        with self._lock:
            state.turns.append(turn)
            if len(state.turns) > self._max_turns:
                state.turns = state.turns[-self._max_turns :]
            state.updated_at = now
            self._states[state.conversation_id] = state
            self._prune(now)

    def delete(self, conversation_id: str) -> bool:
        with self._lock:
            return self._states.pop(conversation_id, None) is not None

    def count(self) -> int:
        with self._lock:
            return len(self._states)


#: The single process-wide store. Swapping this for Redis is the only change a
#: multi-worker deployment needs.
STORE = ConversationStore()
