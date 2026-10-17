"""Coverage claims must describe a dataset, not the whole platform.

The defect this file pins: several user-facing strings said "district input/practice,
irrigation and erosion tables are a single 2025 Season B release". That was true of
the legacy wide extracts and false of the multi-period practice observations
ingested alongside them, so a 2024A or 2026B practice question looked unanswerable
while the data to answer it was being served by its own endpoint.

The rule these tests hold: a coverage sentence is derived from the coverage matrix
for the dataset it is about, and the overview, the period matrix, the legacy
endpoints, the practice endpoint and the assistant agree about which periods each
dataset covers.
"""

from __future__ import annotations

import pytest

from app.services import period_service

QUERY = "/api/v1/assistant/query"

#: The platform-wide sentence that was wrong, in the forms it appeared in.
STALE_CLAIMS = (
    "input/practice, irrigation and erosion tables are still single-release",
    "input/practice, irrigation and erosion tables cover 2025 Season B only",
    "input/practice, irrigation and erosion tables are a single 2025 Season B release",
)


def _require_data(client) -> None:
    res = client.get("/api/v1/analytics/productivity", params={"crop": "Maize"})
    if res.status_code == 503:
        pytest.skip("processed tables not built; run `make data`")
    if not res.json().get("rows"):
        pytest.skip("period panel not built; run `make data`")


def _period_datasets(client) -> dict[str, set[str]]:
    body = client.get("/api/v1/meta/periods").json()
    return {
        str(period["period_code"]): {
            str(dataset.get("dataset")) for dataset in (period.get("datasets") or [])
        }
        for period in body["periods"]
    }


def test_the_practice_range_is_derived_not_literal():
    """The range comes from the periods that actually carry the practice dataset."""
    expected = period_service.dataset_range(period_service.MULTI_PERIOD_PRACTICE_DATASET)
    assert period_service.practice_period_range() == expected
    if not expected:
        pytest.skip("practice observations not built; run `make data`")

    periods_with_practice = [
        entry["period_code"]
        for entry in period_service.catalog()["periods"]
        if any(
            str(d.get("dataset")) == period_service.MULTI_PERIOD_PRACTICE_DATASET
            for d in (entry.get("datasets") or [])
        )
    ]
    assert periods_with_practice
    assert expected == f"{periods_with_practice[0]}-{periods_with_practice[-1]}"


def test_coverage_notes_name_each_dataset_separately(client):
    from app.services import meta_service

    notes = " ".join(meta_service.coverage_notes())
    for stale in STALE_CLAIMS:
        assert stale not in notes, stale

    practice_range = period_service.practice_period_range()
    if practice_range:
        assert practice_range in notes
        # The multi-period series is described as multi-period, not as an extract.
        assert "multi-period" in notes
    assert period_service.single_release_scope() in notes
    assert "legacy single-release" in notes.lower()


def test_the_coverage_endpoint_serves_the_same_notes(client):
    body = client.get("/api/v1/meta/data-coverage").json()
    notes = " ".join(body.get("notes") or [])
    for stale in STALE_CLAIMS:
        assert stale not in notes, stale
    if period_service.practice_period_range():
        assert period_service.practice_period_range() in notes


def test_overview_provenance_names_each_dataset_separately(client):
    _require_data(client)
    body = client.get("/api/v1/dashboard/overview").json()
    limitations = " ".join(body["provenance"]["limitations"])
    for stale in STALE_CLAIMS:
        assert stale not in limitations, stale
    assert period_service.single_release_scope() in limitations
    if period_service.practice_period_range():
        assert period_service.practice_period_range() in limitations


def test_gap_limitations_name_each_dataset_separately(client):
    _require_data(client)
    body = client.get("/api/v1/analytics/productivity-gap", params={"limit": 1}).json()
    limitations = " ".join(body["provenance"]["limitations"])
    for stale in STALE_CLAIMS:
        assert stale not in limitations, stale
    if period_service.practice_period_range():
        assert period_service.practice_period_range() in limitations


def test_the_period_matrix_separates_multi_period_from_the_legacy_extract(client):
    datasets = _period_datasets(client)
    if not datasets:
        pytest.skip("period catalogue unavailable")

    practice_periods = sorted(
        code
        for code, names in datasets.items()
        if period_service.MULTI_PERIOD_PRACTICE_DATASET in names
    )
    legacy_periods = sorted(
        code for code, names in datasets.items() if "district_factors" in names
    )

    if practice_periods:
        # A multi-period series appears for more than one period...
        assert len(practice_periods) > 1, practice_periods
        assert period_service.practice_period_range() == f"{practice_periods[0]}-{practice_periods[-1]}"
    # ...while the legacy wide extract stays a single release.
    if legacy_periods:
        assert legacy_periods == [period_service.SINGLE_RELEASE_DATASETS["district_factors"]]


def test_the_practice_endpoint_answers_the_periods_the_matrix_claims(client):
    """Cross-surface agreement, not two independent opinions."""
    _require_data(client)
    datasets = _period_datasets(client)
    checked = 0
    for code in ("2024A", "2025B", "2026B"):
        names = datasets.get(code)
        if names is None:
            continue
        if period_service.MULTI_PERIOD_PRACTICE_DATASET not in names:
            continue
        body = client.get(
            "/api/v1/analytics/practice-indicators", params={"period_code": code}
        ).json()
        assert body.get("period") == code, (code, body.get("period"))
        assert body.get("observations"), f"the matrix claims practice data for {code}"
        assert code in (body.get("periods") or [code])
        checked += 1
    if checked == 0:
        pytest.skip("practice observations not built; run `make data`")


def test_legacy_endpoints_point_at_the_multi_period_alternative(client):
    _require_data(client)
    practice_range = period_service.practice_period_range()
    if not practice_range:
        pytest.skip("practice observations not built; run `make data`")

    body = client.get(
        "/api/v1/analytics/irrigation", params={"period_code": "2026B"}
    ).json()
    note = body.get("note") or ""
    assert "practice-indicators" in note, note
    assert practice_range in note, note
    assert "legacy single-release" in note.lower()

    # The same period is genuinely covered by the multi-period series.
    practice = client.get(
        "/api/v1/analytics/practice-indicators",
        params={"period_code": "2026B", "domain": "irrigation"},
    ).json()
    assert practice.get("observations"), practice.get("note")

    # And on the period the legacy table does cover, there is no note at all.
    covered = client.get(
        "/api/v1/analytics/irrigation", params={"period_code": "2025B"}
    ).json()
    assert not covered.get("note")


def test_the_assistant_describes_each_series_separately(client):
    _require_data(client)
    res = client.post(QUERY, json={"question": "Which periods are published?"})
    assert res.status_code == 200, res.text
    body = res.json()
    if not body.get("grounded"):
        pytest.skip("coverage question could not be grounded in this build")

    answer = body["answer"]
    for stale in STALE_CLAIMS:
        assert stale not in answer, stale
    practice_range = period_service.practice_period_range()
    if practice_range:
        assert practice_range in answer, answer
    assert period_service.single_release_scope() in answer
    limitations = " ".join(body["limitations"])
    assert "legacy" in limitations.lower()
    if practice_range:
        assert practice_range in limitations
