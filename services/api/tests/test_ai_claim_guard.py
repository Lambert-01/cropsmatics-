"""The claim guard: a figure must be attributable *in its own scope*.

``numeric_guard`` proves the digits exist. These tests pin the part it cannot
prove - that the sentence put them in the right unit, on the right metric, for the
right crop, district and period, and that directional, causal and missing-value
wording is not asserted where the evidence does not support it.

They also pin the opposite direction, which matters just as much: a guard that
rejects legitimate answers silently replaces them all with the fallback. Every
"accepted" assertion below is there to hold that line.
"""

from __future__ import annotations

import pytest

from app.ai import claim_guard, numeric_guard, output_validator
from app.ai.evidence import EvidenceBundle, EvidenceItem, EvidenceKind
from app.ai.grounded import GroundedAnswer
from app.ai.schemas import ProviderOutcome

MAIZE = "Maize"


def item(
    metric: str,
    value: float | int,
    unit: str,
    *,
    district: str | None = None,
    province: str | None = None,
    crop: str | None = MAIZE,
    period_code: str | None = "2026B",
    kind: EvidenceKind = EvidenceKind.OFFICIAL,
) -> EvidenceItem:
    return EvidenceItem(
        evidence_id=f"e:{metric}:{district}:{period_code}:{value}",
        kind=kind,
        metric=metric,
        value=value,
        unit=unit,
        district=district,
        province=province,
        crop=crop,
        period_code=period_code,
        source_id="NISR_SAS_2025B_DISTRICT_CROP",
    )


def bundle(*items: EvidenceItem, district: str | None = None, crop: str | None = MAIZE):
    return EvidenceBundle(
        query_id="t",
        intent="district_crop_gap",
        requested={"district": district, "crop": crop},
        items=list(items),
    )


# --- the failure numeric_guard cannot see -------------------------------------


def _yield_and_production() -> EvidenceBundle:
    return bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara"),
        item("production_mt", 3200.0, "metric tonnes", district="Gisagara"),
    )


def test_digits_exist_but_under_the_wrong_unit():
    """The motivating case: numeric_guard passes, and the sentence is still wrong."""
    subject = _yield_and_production()
    sentence = "Maize production in Gisagara was 1,159 metric tonnes in 2026B."

    # 1,159 exists in the evidence, so the digit check alone is satisfied...
    assert numeric_guard.check(sentence, subject).ok is True

    # ...and the claim is rejected, because 1,159 is a yield in kg/ha and the
    # production of that district is 3,200 metric tonnes.
    result = claim_guard.check(sentence, subject)
    assert result.ok is False
    assert result.violations[0].kind == "unit_mismatch"
    assert "kg/ha" in result.violations[0].detail


def test_a_correctly_scoped_figure_is_accepted():
    result = claim_guard.check(
        "Maize yield in Gisagara was 1,159 kg/ha in 2026 Season B.", _yield_and_production()
    )
    assert result.ok is True
    assert result.claims_checked == 1
    assert result.scoped_checked == 1


def test_value_attributed_to_the_wrong_district_is_rejected():
    subject = bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara"),
        item("yield_kg_ha", 2400.0, "kg/ha", district="Nyagatare"),
    )
    result = claim_guard.check("Maize yield in Nyagatare was 1,159 kg/ha.", subject)
    assert result.ok is False
    assert result.violations[0].kind == "scope_mismatch"
    assert "Gisagara" in result.violations[0].detail


def test_value_placed_in_the_wrong_period_is_rejected():
    subject = bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara", period_code="2026B")
    )
    result = claim_guard.check(
        "Maize yield in Gisagara was 1,159 kg/ha in 2025 Season B.", subject
    )
    assert result.ok is False
    assert result.violations[0].kind == "scope_mismatch"


def test_value_attributed_to_the_wrong_crop_is_rejected():
    subject = bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara", crop="Maize"),
        item("yield_kg_ha", 800.0, "kg/ha", district="Gisagara", crop="Beans"),
    )
    result = claim_guard.check("Beans yield in Gisagara was 1,159 kg/ha.", subject)
    assert result.ok is False
    assert result.violations[0].kind == "scope_mismatch"


def test_a_national_figure_named_alongside_districts_is_accepted():
    """The value carries no district, so district names next to it prove nothing."""
    subject = EvidenceBundle(
        query_id="t",
        intent="national_indicator",
        requested={"crop": MAIZE},
        items=[
            EvidenceItem(
                evidence_id="e:mean",
                kind=EvidenceKind.DERIVED,
                metric="improved_seed_farmers_pct",
                value=26.1,
                unit="% of farmers",
                period_code="2025B",
                geography_level="national",
                method="unweighted mean of published district rows",
            ),
            EvidenceItem(
                evidence_id="e:n",
                kind=EvidenceKind.DERIVED,
                metric="national_indicator_n_observations",
                value=30,
                unit="observations",
                period_code="2025B",
                method="count of published district rows",
            ),
            item(
                "improved_seed_farmers_pct",
                1.56,
                "% of farmers",
                district="Rusizi",
                period_code="2025B",
            ),
        ],
    )
    result = claim_guard.check(
        "In 2025 Season B, improved seed use averages 26.10% across 30 published "
        "observations, lowest in Rusizi (1.56).",
        subject,
    )
    assert result.ok is True


def test_the_metric_word_a_figure_sits_next_to_is_checked():
    subject = bundle(item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara"))
    result = claim_guard.check("Gisagara production was 1,159 kg/ha.", subject)
    assert result.ok is False
    assert result.violations[0].kind == "metric_mismatch"


def test_a_share_list_is_read_clause_by_clause():
    """'12.3% sold ... 3.4% post-harvest loss' must not label every share 'loss'."""
    subject = bundle(
        item("sold_pct", 12.3, "% of production", district=None, period_code="2025B"),
        item(
            "post_harvest_losses_pct",
            3.4,
            "% of production",
            district=None,
            period_code="2025B",
        ),
    )
    result = claim_guard.check(
        "For Maize, the national post-harvest table records 12.3% sold, 45.6% kept and "
        "3.4% reported as post-harvest loss in 2025 Season B.",
        subject,
    )
    # 3.4% is published and 12.3% is published; only 45.6% is absent, and it is
    # reported as an unsupported value rather than as a metric mismatch.
    kinds = {v.kind for v in result.violations}
    assert "metric_mismatch" not in kinds
    assert kinds == {"unsupported_value"}


# --- qualitative claims --------------------------------------------------------


def _two_districts() -> EvidenceBundle:
    return bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara"),
        item("yield_kg_ha", 2400.0, "kg/ha", district="Nyagatare"),
    )


def test_a_reversed_comparison_is_rejected():
    result = claim_guard.check(
        "Maize yield in Gisagara was higher than in Nyagatare.", _two_districts()
    )
    assert result.ok is False
    assert result.violations[0].kind == "comparison_direction"


def test_a_correct_comparison_is_accepted():
    result = claim_guard.check(
        "Maize yield in Nyagatare was higher than in Gisagara.", _two_districts()
    )
    assert result.ok is True


def test_an_unverifiable_comparison_is_not_a_violation():
    """Different metrics on each side: there is nothing to contradict."""
    subject = bundle(
        item("yield_kg_ha", 1159.0574, "kg/ha", district="Gisagara"),
        item("harvested_area_ha", 2400.0, "ha", district="Nyagatare"),
    )
    assert claim_guard.check("Gisagara is higher than Nyagatare.", subject).ok is True


def test_a_reversed_period_comparison_is_rejected():
    subject = bundle(
        item("yield_mt_ha", 1.4, "t/ha", district=None, period_code="2026B"),
        item("yield_mt_ha", 2.2, "t/ha", district=None, period_code="2025B"),
    )
    result = claim_guard.check(
        "Maize yield was higher in 2026 Season B than in 2025 Season B.", subject
    )
    assert result.ok is False
    assert result.violations[0].kind == "comparison_direction"


def _change_bundle(change_pct: float) -> EvidenceBundle:
    return bundle(
        item("production_mt", 1187.0, "metric tonnes", district=None, period_code="2026B"),
        item("production_mt", 1093.0, "metric tonnes", district=None, period_code="2025B"),
        item(
            "production_mt_change_pct",
            change_pct,
            "%",
            district=None,
            period_code="2026B",
            kind=EvidenceKind.DERIVED,
        ),
    )


def test_a_percentage_change_claimed_in_the_wrong_direction_is_rejected():
    result = claim_guard.check(
        "Maize production fell 8.6% in 2026 Season B, to 1,187 metric tonnes.",
        _change_bundle(8.6),
    )
    assert result.ok is False
    assert result.violations[0].kind == "change_direction"


def test_a_negative_change_with_the_right_sign_is_accepted():
    result = claim_guard.check(
        "Maize production saw a change of -8.6% in 2026 Season B, to 1,187 metric tonnes.",
        _change_bundle(-8.6),
    )
    assert result.ok is True


def test_a_rise_claimed_for_a_falling_series_is_rejected():
    result = claim_guard.check(
        "Maize production rose 8.6% in 2026 Season B, to 1,187 metric tonnes.",
        _change_bundle(-8.6),
    )
    assert result.ok is False
    assert result.violations[0].kind == "change_direction"


def test_causal_wording_over_observational_evidence_is_rejected():
    result = claim_guard.check(
        "Distributing more improved seed will increase maize yield in Gisagara.",
        _two_districts(),
    )
    assert result.ok is False
    assert result.violations[0].kind == "causal_wording"


def test_assumption_based_wording_is_allowed_when_a_scenario_is_in_evidence():
    subject = bundle(
        item("harvested_area_ha", 1200.0, "ha", district="Gisagara"),
        EvidenceItem(
            evidence_id="e:scenario",
            kind=EvidenceKind.SCENARIO,
            metric="production_mt",
            value=1500.0,
            unit="metric tonnes",
            district="Gisagara",
            crop=MAIZE,
            period_code="2026B",
            method="stated assumption: +10% yield",
        ),
    )
    result = claim_guard.check(
        "Under the stated assumption, production will increase to 1,500 metric tonnes.",
        subject,
    )
    assert result.ok is True


def test_an_unknown_capacity_asserted_as_zero_is_rejected():
    result = claim_guard.check(
        "Post-harvest storage capacity is zero in Gisagara.", _two_districts()
    )
    assert result.ok is False
    assert result.violations[0].kind == "missing_value"


def test_a_published_capacity_is_accepted():
    subject = bundle(
        item("storage_capacity_mt", 45000.0, "metric tonnes", district="Gisagara"),
    )
    result = claim_guard.check(
        "Gisagara has published storage capacity of 45,000 metric tonnes.", subject
    )
    assert result.ok is True


# --- the validator turns a rejected claim into the deterministic answer --------


def _reference() -> GroundedAnswer:
    return GroundedAnswer(
        answer="Maize yield in Gisagara was 1,159 kg/ha in 2026 Season B.",
        grounded=True,
        intent="district_crop_gap",
        evidence={"district": "Gisagara", "crop": MAIZE},
    )


def _outcome(text: str) -> ProviderOutcome:
    return ProviderOutcome(
        answer=text, grounded=True, intent="district_crop_gap", mode="llm", citations=[]
    )


def test_the_validator_falls_back_when_a_claim_is_unverifiable():
    validated = output_validator.validate(
        _outcome("Maize production in Gisagara was 1,159 metric tonnes in 2026 Season B."),
        _yield_and_production(),
        _reference(),
    )
    assert validated.mode == "deterministic"
    assert validated.answer == _reference().answer
    assert validated.validation["claims"]["ok"] is False
    assert "unit_mismatch" in validated.validation["fallback_reason"]


def test_the_validator_keeps_a_provider_answer_whose_claims_hold():
    validated = output_validator.validate(
        _outcome("Maize yield in Gisagara was 1,159 kg/ha in 2026 Season B."),
        _yield_and_production(),
        _reference(),
    )
    assert validated.mode == "llm"
    assert validated.validation["used_fallback"] is False
    assert validated.validation["claims"]["ok"] is True


# --- the guard must not reject the answers that are correct by construction ---

QUERY = "/api/v1/assistant/query"

#: One question per grounded intent. The deterministic answers are computed from
#: the published tables rather than from retrieved prose, so every one of them is
#: correct by construction - and every one of them must therefore pass the guard.
#: A guard that fails them would replace the whole answer set with the fallback
#: while still looking like it was working.
GROUNDED_QUESTIONS = [
    "Why is maize yield low in Gisagara?",
    "Tell me about Musanze",
    "How many farmers use irrigation?",
    "How much rice is produced in Rwanda?",
    "Compare maize and beans in Rwanda",
    "How is maize used after harvest?",
    "Which districts have the largest maize productivity gaps?",
    "Which periods are published?",
    "Where does the data come from?",
    "Is a maize forecast published?",
    "How has maize yield changed since last season?",
    "What practices are associated with maize yield?",
]


def _ask(client, question: str) -> dict:
    res = client.post(QUERY, json={"question": question})
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.parametrize("question", GROUNDED_QUESTIONS)
def test_every_grounded_answer_passes_the_claim_guard(client, question: str):
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503 or not res.json().get("rows"):
        pytest.skip("processed tables not built; run `make data`")

    body = _ask(client, question)
    assert body["grounded"] is True, question
    claims = body["validation"]["claims"]
    assert claims["ok"] is True, (question, claims["violations"])
    # The deterministic provider's own text must survive both guards it is checked
    # by, otherwise every response silently reports a fallback.
    assert body["validation"]["numeric"]["ok"] is True, (question, body["validation"])
    assert body["validation"]["used_fallback"] is False, (question, body["validation"])


def test_registered_sources_are_retrieved_as_real_evidence():
    """Provenance answers must be grounded in the registry, not in nothing.

    The tool used to read columns the registry does not publish, which produced
    empty items with colliding ids - so a "where does the data come from" answer
    cited evidence that carried no source name at all.
    """
    from app.ai.tools import metadata as metadata_tools

    items = metadata_tools.source_metadata()
    if not items:
        pytest.skip("source registry not built; run `make data`")
    assert len({item.evidence_id for item in items}) == len(items)
    assert all(isinstance(item.value, str) and item.value for item in items)
    assert all(item.source_id for item in items)

    entries = metadata_tools.source_registry()
    if entries:
        assert len({item.evidence_id for item in entries}) == len(entries)
        assert all(isinstance(item.value, str) and item.value for item in entries)


def test_a_published_figure_is_recognised_with_or_without_its_sign():
    """A withholding reason that reports "skill -146.4%" grounds a quoted "146.4%"."""
    subject = EvidenceBundle(
        query_id="t",
        intent="forecast_status",
        items=[
            EvidenceItem(
                evidence_id="e:status",
                kind=EvidenceKind.CONTEXT,
                metric="serves_forecast",
                value="no",
                source_id="ML_FORECAST_BACKTEST",
                note="candidate drift does not beat the naive baseline (skill -146.4%)",
            )
        ],
    )
    assert numeric_guard.check("skill of 146.4%", subject).ok is True
    assert claim_guard.check("a skill of 146.4% against the baseline.", subject).ok is True
