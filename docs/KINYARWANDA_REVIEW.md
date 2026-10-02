# Kinyarwanda Review

Status legend: **TRANSLATED** (human-reviewed), **NEEDS_NATIVE_REVIEW**,
**TEMPORARY_ENGLISH_FALLBACK**.

Cropmatics does not silently copy English and present it as translated.

## Assistant (Ask Cropmatics)

The assistant renders the *same structured evidence* in every language. Only the
prose differs; numbers, source, period and coverage are byte-for-byte identical
(guarded by `test_kinyarwanda_answer_uses_identical_evidence`).

| Phrase | Key | Status |
|---|---|---|
| Refusal | `refusal` | TRANSLATED |
| Evidence framing | `evidence_intro` | TRANSLATED |
| Grounded sentence bodies | — | TEMPORARY_ENGLISH_FALLBACK |

When a Kinyarwanda sentence has not been human-reviewed, the API returns the
English sentence prefixed by the reviewed framing and sets
`translation_status = "TEMPORARY_ENGLISH_FALLBACK"`. The mobile Ask screen labels
these answers "Kinyarwanda review pending".

Reviewer checklist for promoting a phrase to TRANSLATED:
1. Native speaker confirms the sentence reads naturally.
2. Numbers and units match the English rendering exactly.
3. Add the phrase to `REVIEWED_RW` in `app/services/assistant_language.py` and
   flip its status in `rw_template_status`.

## Mobile UI strings

`apps/mobile/src/i18n/{en,rw}.ts` are key-parity tested
(`tests/i18n.test.ts`). The intelligence namespace keys added in this build are
mirrored in `rw.ts` as **NEEDS_NATIVE_REVIEW** — they are present so the UI does
not fall back to English mid-screen, but they have not all been signed off by a
native reviewer.

Known items needing review: `explore*`, `maps*`, `indicators*`, `compare*`,
`postHarvest*`, `ask*`, `saved*`, `inquiry*`, `more*`, `settings*`, `sources*`,
`methodology*`, `about*`, `privacy*`, `help*`, `offline*`, `errors*`.

## What still needs human verification

* All `rw` strings above.
* The two reviewed assistant phrases (confirm with a native reviewer).
