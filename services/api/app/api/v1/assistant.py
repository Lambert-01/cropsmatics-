"""Grounded AI explanation endpoint.

The assistant is an **explanation layer**, not a source of numbers. It resolves a
district and crop from the question, retrieves validated analytics, and composes
an answer strictly from those values. If it cannot ground the question it says so
instead of guessing. No LLM is required for this MVP behaviour; an LLM can be
added later as a rephrasing layer over the same retrieved evidence.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.analytics.productivity_gap import compute_gaps
from app.repositories import dataset_repository as repo

router = APIRouter(prefix="/assistant", tags=["assistant"])


class QueryIn(BaseModel):
    question: str
    language: str = "en"


class QueryOut(BaseModel):
    answer: str
    grounded: bool
    evidence: dict
    limitations: list[str]


def _resolve(question: str) -> tuple[str | None, str | None]:
    q = question.lower()
    districts = repo.districts()
    crops = repo.crops()
    district = next((d for d in districts["district"] if str(d).lower() in q), None)
    crop = next(
        (c for c in crops["crop_name"] if str(c).lower() in q),
        None,
    )
    if crop is None:
        # match on Kinyarwanda names too
        crop = next(
            (row["crop_name"] for _, row in crops.iterrows()
             if str(row.get("kinyarwanda_name", "")).lower() in q),
            None,
        )
    return district, crop


@router.post("/query", response_model=QueryOut)
def query(payload: QueryIn) -> QueryOut:
    district, crop = _resolve(payload.question)
    limitations = ["uses aggregate district data; not farm-specific", "association, not causation"]

    if district is None or crop is None:
        return QueryOut(
            answer=(
                "I can only explain results from validated data. Please name a known "
                "district and crop (for example: 'Why is maize yield low in Gasabo?')."
            ),
            grounded=False,
            evidence={},
            limitations=limitations + ["question not grounded to a district and crop"],
        )

    try:
        df = repo.training_dataset()
    except Exception:
        return QueryOut(
            answer="The analytical dataset is not available yet. Run the data pipeline first.",
            grounded=False,
            evidence={},
            limitations=limitations + ["training dataset not built"],
        )

    gapped = compute_gaps(df, strategy="national_crop_median")
    row = gapped[
        (gapped["district"] == district) & (gapped["canonical_crop_name"] == crop)
    ]
    if row.empty:
        return QueryOut(
            answer=f"No validated observation found for {crop} in {district}.",
            grounded=False,
            evidence={},
            limitations=limitations,
        )

    r = row.iloc[0]
    observed = r["yield_kg_ha"]
    benchmark = r["benchmark_yield_kg_ha"]
    gap = r["gap_index"]
    direction = "below" if gap and gap > 0 else "above"
    answer = (
        f"In 2025 Season B, {crop} yield in {district} was {observed:.0f} kg/ha, "
        f"{direction} the national {crop} median of {benchmark:.0f} kg/ha "
        f"(productivity gap index {gap:.1f}). This is an association between the "
        f"district's observed practices and its yield, not proof that changing any "
        f"single factor would cause this difference."
    )
    evidence = {
        "district": district,
        "crop": crop,
        "observed_yield_kg_ha": float(observed),
        "benchmark_yield_kg_ha": float(benchmark),
        "benchmark_strategy": "national_crop_median",
        "gap_index": float(gap) if gap is not None else None,
        "source_id": r.get("source_id"),
        "source_period": r.get("source_period"),
    }
    return QueryOut(answer=answer, grounded=True, evidence=evidence, limitations=limitations)
