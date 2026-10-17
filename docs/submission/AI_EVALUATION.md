# AI Evaluation

Review update, 2026-10-18: the validator now binds crop and period mentions to
the value-bearing comparison segment. Wrong-crop and swapped-period cases are
rejected, while the grounded positive corpus remains accepted. This is
deterministic claim-validation evidence, not a credentialed provider-quality
claim or a substitute for production monitoring.
See [Current Status](../CURRENT_STATUS.md).

What the assistant's answers are checked against, which of those checks are
executed automatically, and what remains unverified. Written from the commands
that were actually run in this session, not from the intentions behind them.

## The claim being evaluated

The platform's non-negotiable rule is that the language model is never the source
of an agricultural figure. That splits into three testable claims:

1. a number in an answer exists in the evidence that was retrieved;
2. it exists **in the scope the sentence puts it in** — the unit it is written in,
   the metric word it is attached to, the crop, district, province and period it is
   claimed for;
3. the qualitative claims around it hold: comparison direction, the sign of a
   percentage change, association not restated as effect, and missing capacity not
   asserted as zero.

Claim 1 is checked by `numeric_guard`; heuristic checks for claims 2 and 3 run in `claim_guard`; the
provenance of the citations by `citation_guard`. All three run in
`app/ai/output_validator.py` for every provider answer — including the
deterministic provider, so the fallback text is itself checked — and again in
`app/api/v1/assistant.py` for a translated rendering. A failure returns the
deterministic answer and records the failing guard, the reason and the claim.

## Evaluation sets

| Set | File | What it measures |
|---|---|---|
| Planner gold corpus | `tests/ai_eval/planner_cases.jsonl` | Intent, crop, district and language for curated EN/RW questions. |
| Grounded-answer set | `tests/test_ai_claim_guard.py` | One question per grounded intent (12). The deterministic answer for each must pass both guards, with `used_fallback: false`. |
| Claim-level adversarial set | `tests/test_ai_claim_eval.py` | Five bad-answer shapes driven through the real request path, plus controls. |
| Guard unit suite | `tests/test_ai_claim_guard.py` | The rules themselves: unit mismatch, scope (crop/district/province/period), metric word, comparison direction, change direction, causal wording, unknown capacity, and the accepted cases that must **not** be rejected. |
| Injection suite | `tests/test_ai_injection.py` | Retrieved text and questions as untrusted input; unregistered tool refusal. |
| Forecast suppression | `tests/test_ai_forecast.py`, `tests/test_forecast_scope.py` | The publication gate: a withheld target is explained, never estimated. |
| Provider configuration | `tests/test_ai_provider_config.py` | Alias precedence, no key in a client bundle, refusal of an unregistered tool. |

### The adversarial cases, and how each is caught

| Case | Answer shape | Rejected by | Violation |
|---|---|---|---|
| Figure moved to another unit | a yield value stated as "metric tonnes" | `claim_guard` | `unit_mismatch` |
| Figure moved to another district | district B's gap stated for district A | `claim_guard` | `scope_mismatch` |
| Comparison reversed | the lower figure said to be higher | `claim_guard` | `comparison_direction` |
| Association restated as effect | "will increase yield" over observational evidence | `claim_guard` | `causal_wording` |
| Figure from an injected instruction | a value that exists nowhere in the bundle | `numeric_guard` | unattributable figure |

The control cases matter as much as the adversarial ones: the same provider
restating the retrieved evidence must be **accepted** (`answer_mode: "llm"`,
`claims.ok: true`), and 12 real questions must produce deterministic answers that
survive both guards. A guard that rejected everything would otherwise look like a
perfect score here.

## Results (this session)

| Command | Result |
|---|---|
| `pytest tests/test_ai_claim_guard.py tests/test_ai_claim_eval.py` | **45 passed** |
| `pytest tests/test_ai_engine.py tests/test_ai_agent.py tests/test_ai_injection.py tests/test_ai_eval.py tests/test_ai_claim_guard.py tests/test_ai_claim_eval.py` | **116 passed** |
| `pytest tests` (whole API suite) | passed, exit 0 |

Two real defects were found by these evaluations and repaired, rather than
documented as caveats:

* the source-registry tools read columns the registry does not publish
  (`source_id`, `title`, `dataset`), so every provenance answer cited empty
  evidence with colliding ids. Provenance answers are now grounded in the dataset
  name and its descriptive fields.
* the numeric allow-list did not read numbers out of a string `value` or handle a
  published negative figure quoted unsigned, so the platform's own coverage and
  withholding summaries were rejected by its own guard. Both are fixed, and the
  coverage tool now carries the period count its answer states.

## Not verified here

* **A credentialed provider.** No `AI_API_KEY` is available in this environment, so
  the remote/Responses path is exercised only against mocked transports. Real
  account access, model availability, latency, cost behaviour and provider-side
  refusal patterns are unverified. Every claim-level result above is therefore a
  statement about the **guards**, not about a specific model's output.
* **Adaptive evasion.** The guards reason about numbers, units, scope words and a
  fixed causal vocabulary. A paraphrase that changes meaning without moving a
  figure — an incorrectly hedged claim, an implication by juxtaposition — is not
  detected. Guarding that would need claim extraction against the evidence
  structure, which does not exist here.
* **Kinyarwanda beyond templates.** Claim and numeric checks are language-neutral
  for digits and unit symbols, and the translated rendering is re-checked, but the
  scope and causal vocabulary is English. A Kinyarwanda sentence's scope words are
  not independently validated. Native review is still pending; no review is
  claimed.
* **Human answer-quality ratings.** No rubric-scored human review of answer clarity
  or usefulness has been performed.

## Reproduce

```bash
cd services/api   # or the repository root with PYTHONPATH=services/api
.venv/bin/python -m pytest tests/test_ai_claim_guard.py tests/test_ai_claim_eval.py -q
.venv/bin/python -m pytest tests/test_ai_engine.py tests/test_ai_agent.py \
  tests/test_ai_injection.py tests/test_ai_eval.py -q
```

The claim suites need the processed tables (they skip with a stated reason when
`/analytics/productivity` returns 503); the guard unit tests and the planner gold
corpus do not.
