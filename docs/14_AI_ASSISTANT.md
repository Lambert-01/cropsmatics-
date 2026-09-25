# 14. AI Assistant

## Role

The assistant is an **explanation layer**, not a model that produces numbers. It:

1. resolves a district and crop from the question (English or Kinyarwanda names);
2. retrieves validated analytics (productivity gap, factors, priorities, risk);
3. composes an answer **only** from those retrieved values;
4. always returns limitations and the evidence it used.

## Hard rules

- Never invent yield, price, storage capacity, risk percentage or production.
- Never present an association as a cause; use "associated with", "model
  contribution", "priority for investigation".
- If the question cannot be grounded to a known district/crop, say so instead of
  guessing.

## Current implementation

`POST /api/v1/assistant/query` is deterministic and requires no LLM: it grounds
the question and composes an answer from the processed productivity table. This
keeps the MVP honest and testable.

## Adding an LLM later

Use the LLM **only** to rephrase the retrieved evidence (optionally into
Kinyarwanda). Guardrails:

- pass the retrieved evidence JSON into the prompt; forbid new numbers;
- post-check that any number in the answer appears in the evidence;
- keep the same response contract (`grounded`, `evidence`, `limitations`).

See also `docs/MODEL_INTERPRETATION_POLICY.md`.
