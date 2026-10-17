"""Manual projection orchestration.

Wires three verified pieces together and computes nothing else:

* ``repositories.dataset_repository`` supplies the canonical productivity panel,
  the only place an observed baseline may come from;
* ``analytics.manual_projection`` holds the arithmetic, which is pure and tested
  on its own;
* ``services.period_service`` names periods and seasons.

Nothing here writes to the database. A projection is a stateless calculation: the
response is the whole artefact, so there is nothing to accidentally persist into
``crop_productivity`` or any observation table.

A request that cannot be answered — no published same-season history, a window
larger than the history, an unsupported personal-plan combination — raises
:class:`ProjectionUnavailable` with a structured reason rather than returning an
all-null success that would look like a completed calculation.
"""

from __future__ import annotations

import hashlib
import json
import statistics

import pandas as pd

from app.analytics import manual_projection as mp
from app.repositories import dataset_repository as repo
from app.schemas.common import Provenance
from app.schemas.manual_projection import (
    BaselineObservation,
    EvidenceReference,
    ManualProjectionRequest,
    ManualProjectionResponse,
    ProjectedPoint,
    ProjectionCaseResult,
    ProjectionExportRow,
    ResolvedSelection,
)
from app.services import period_service

SOURCE_PANEL = "NISR_SAS_CANONICAL_PRODUCTIVITY"


class ProjectionUnavailable(ValueError):
    """The selection cannot be projected, with a reason a caller can act on."""

    def __init__(self, message: str, *, code: str = "projection_unavailable") -> None:
        super().__init__(message)
        self.code = code


def _value(row: pd.Series, name: str) -> str | None:
    """A lineage string, or None — never the literal ``"nan"``."""
    if name not in row:
        return None
    raw = row.get(name)
    if raw is None or (isinstance(raw, float) and raw != raw):
        return None
    text = str(raw).strip()
    return text or None


def _number(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if number != number else number


def _panel() -> pd.DataFrame:
    try:
        panel = repo.crop_productivity()
    except (repo.DatasetOutOfSync, repo.CanonicalDataUnavailable):
        raise
    except Exception as exc:  # noqa: BLE001 - report as unavailable, not a 500
        raise ProjectionUnavailable(str(exc), code="panel_unavailable") from exc
    if panel.empty:
        raise ProjectionUnavailable("the canonical productivity panel is empty")
    return panel


def _scope_frame(panel: pd.DataFrame, payload: ManualProjectionRequest) -> pd.DataFrame:
    """The published rows for the requested geography x crop."""
    level = "NATIONAL" if payload.geography == "national" else "DISTRICT"
    frame = panel[
        (panel["geography_level"].astype(str).str.upper() == level)
        & (panel["farmer_scale"].astype(str).str.lower() == "all")
        & (panel["canonical_crop_name"].astype(str).str.lower() == payload.crop.strip().lower())
    ].copy()
    if payload.geography == "district":
        if not payload.district:
            raise ProjectionUnavailable(
                "geography 'district' requires a district name", code="district_required"
            )
        frame = frame[frame["district"].astype(str).str.lower() == payload.district.strip().lower()]
    if frame.empty:
        where = payload.district if payload.geography == "district" else "national"
        raise ProjectionUnavailable(
            f"the canonical panel publishes no {payload.geography} rows for "
            f"{payload.crop!r} in {where!r}; no baseline can be established from "
            "another district, another crop or a national average",
            code="no_published_rows",
        )
    return frame


def _same_season_observations(frame: pd.DataFrame, season: str, metric: str) -> list[dict]:
    """Published same-season observations of one metric, chronological.

    Only the requested season letter is used: Season A, B and C of one year are
    three seasons of one year, not three years. A period the release did not
    tabulate has no row at all, and is never treated as a zero.
    """
    rows: list[dict] = []
    if metric not in frame.columns:
        return rows
    grouped = frame.groupby("period_code", sort=False)
    for period_code, group in grouped:
        code = str(period_code)
        try:
            year, letter = mp.parse_period(code)
        except mp.ProjectionError:
            continue
        if letter != season:
            continue
        value = _number(group[metric].sum(min_count=1))
        if value is None or value <= 0:
            continue
        first = group.iloc[0]
        rows.append(
            {
                "period_code": code,
                "value": value,
                "observation": {
                    "period_code": code,
                    "period_label": period_service.label(code),
                    "value": mp.round_value(value),
                    "unit": mp.METRIC_UNITS.get(metric, ""),
                    "source_id": _value(first, "source_id"),
                    "source_release": _value(first, "source_release"),
                    "source_workbook": _value(first, "source_workbook"),
                    "source_sheets": _value(first, "source_sheets"),
                    "row_scope": _value(first, "row_scope"),
                    "farmer_scale": _value(first, "farmer_scale"),
                },
            }
        )
    rows.sort(key=lambda item: mp.period_sort_key(item["period_code"]))
    return rows


def _resolve_origin(observations: list[dict], requested: str | None, crop: str, season: str):
    """The origin observation, plus the (possibly restricted) evidence window."""
    if not observations:
        raise ProjectionUnavailable(
            f"the canonical panel publishes no positive {season}-season observations "
            f"for {crop!r}, so there is no observed baseline to start from. Enter a "
            "personal assumption instead if you want to plan without one.",
            code="no_same_season_history",
        )
    if requested:
        try:
            canonical = period_service.require(requested)
        except period_service.UnknownPeriodError as exc:
            raise ProjectionUnavailable(str(exc), code="unknown_origin") from exc
        matching = [o for o in observations if o["period_code"] == canonical]
        if not matching:
            seasons = ", ".join(o["period_code"] for o in observations)
            raise ProjectionUnavailable(
                f"{canonical} is not a {season}-season observation with published data "
                f"for {crop!r} ({seasons}); it cannot be used as an origin",
                code="origin_not_observed",
            )
        origin_key = mp.period_sort_key(canonical)
        window = [o for o in observations if mp.period_sort_key(o["period_code"]) <= origin_key]
        return matching[0], window
    return observations[-1], observations


def _personal_origin(
    payload: ManualProjectionRequest, observations: list[dict], crop: str
) -> tuple[dict, list[dict]]:
    """Place a personal plan on the period axis.

    A personal plan does not need a published baseline, so it must not fail just
    because the panel has no same-season history for the crop. When history does
    exist it is returned as context (the chart can draw the observed series);
    when it does not, the origin is the requested or latest published period.
    """
    if observations:
        origin, _ = _resolve_origin(observations, payload.origin_period, crop, payload.season)
        return origin, observations
    code = payload.origin_period or period_service.latest()
    if not code:
        raise ProjectionUnavailable(
            "no published period data was found to anchor the projection",
            code="no_period_axis",
        )
    try:
        canonical = period_service.require(code)
    except period_service.UnknownPeriodError as exc:
        raise ProjectionUnavailable(str(exc), code="unknown_origin") from exc
    return {"period_code": canonical, "value": None}, []


def _baseline(
    payload: ManualProjectionRequest,
    origin: dict,
    window: list[dict],
    metric: str,
) -> tuple[float, bool, str]:
    """The baseline value, whether it is a user assumption, and a note.

    A personal plan starts from the caller's own inputs, so it is dispatched on
    the *method* rather than on the baseline choice: the default baseline choice
    (latest observed) does not apply to it.
    """
    if payload.method == mp.METHOD_PERSONAL:
        if payload.assumed_yield_kg_ha is None or payload.assumed_harvested_area_ha is None:
            raise ProjectionUnavailable(
                "a personal plan needs both an assumed yield and an assumed harvested area",
                code="personal_inputs_missing",
            )
        produced = mp.production_from(
            payload.assumed_yield_kg_ha, payload.assumed_harvested_area_ha
        )
        return (
            produced,
            True,
            "your own assumed yield and harvested area; no published baseline was used",
        )

    if payload.baseline == mp.BASELINE_LATEST:
        return (
            float(origin["value"]),
            False,
            f"latest observed {payload.season}-season value ({origin['period_code']})",
        )

    if payload.baseline == mp.BASELINE_MEDIAN:
        size = payload.baseline_window or 3
        if len(window) < size:
            codes = ", ".join(o["period_code"] for o in window)
            raise ProjectionUnavailable(
                f"a {size}-period median baseline needs {size} comparable "
                f"{payload.season}-season observations at or before the origin, but "
                f"only {len(window)} are published ({codes}). Choose a smaller window "
                "or the latest-observed baseline.",
                code="window_too_short",
            )
        chosen = window[-size:]
        values = [o["value"] for o in chosen]
        codes = ", ".join(o["period_code"] for o in chosen)
        return (
            float(statistics.median(values)),
            False,
            f"median of {size} {payload.season}-season observations ({codes})",
        )

    raise ProjectionUnavailable(
        f"unknown baseline choice {payload.baseline!r}", code="unknown_baseline"
    )


def _validate(payload: ManualProjectionRequest) -> str:
    """Reject incompatible combinations up front, with a reason."""
    metric = payload.metric

    if payload.method == mp.METHOD_PERSONAL:
        if metric != mp.METRIC_PRODUCTION:
            raise ProjectionUnavailable(
                "a personal plan estimates production from an assumed yield and area; "
                "set metric to 'production_mt'",
                code="personal_metric_mismatch",
            )
        if payload.cases is not None:
            raise ProjectionUnavailable(
                "a personal plan is a single estimate; assumption bands do not apply to it",
                code="cases_not_supported",
            )
        return metric

    if payload.method == mp.METHOD_CARRY_FORWARD and payload.change_pct is not None:
        # `change_pct` only means something to the percent_change method.
        raise ProjectionUnavailable(
            "change_pct is only used by the 'percent_change' method",
            code="unexpected_assumption",
        )

    if (
        payload.method == mp.METHOD_PERCENT_CHANGE
        and payload.change_pct is None
        and not payload.cases
    ):
        raise ProjectionUnavailable(
            "the 'percent_change' method needs change_pct or assumption cases",
            code="missing_assumption",
        )

    if payload.cases is not None:
        labels = [case.label for case in payload.cases]
        if len(set(labels)) != len(labels):
            raise ProjectionUnavailable(
                "assumption cases must have distinct labels (lower, main, higher)",
                code="duplicate_case_label",
            )
    return metric


def _cases(payload: ManualProjectionRequest) -> list[dict]:
    """The assumption cases to compute, ordered lower -> higher."""
    if payload.method == mp.METHOD_PERSONAL:
        return [{"label": "main", "change_pct": None}]
    if payload.method == mp.METHOD_CARRY_FORWARD:
        return [{"label": "main", "change_pct": 0.0}]
    if payload.cases:
        by_label = {case.label: case.change_pct for case in payload.cases}
        if {"lower", "main", "higher"} <= set(by_label):
            if not (by_label["lower"] <= by_label["main"] <= by_label["higher"]):
                raise ProjectionUnavailable(
                    "assumption cases must satisfy lower <= main <= higher",
                    code="cases_out_of_order",
                )
        return [
            {"label": case.label, "change_pct": case.change_pct}
            for case in sorted(payload.cases, key=lambda c: c.change_pct)
        ]
    return [{"label": "main", "change_pct": payload.change_pct}]


def _calculation_id(spec: dict, dataset_version: str | None) -> str:
    """A stable id: the same specification against the same dataset reproduces it."""
    blob = json.dumps(
        {"spec": spec, "dataset_version": dataset_version, "methodology": mp.METHODOLOGY_VERSION},
        sort_keys=True,
        default=str,
    )
    return "mp_" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def run(payload: ManualProjectionRequest) -> ManualProjectionResponse:
    metric = _validate(payload)
    unit = mp.METRIC_UNITS.get(metric, "")
    panel = _panel()
    frame = _scope_frame(panel, payload)

    first = frame.iloc[0]
    crop_name = str(first["canonical_crop_name"])
    crop_code = _value(first, "crop_code")
    province = _value(first, "province")
    district_name = _value(first, "district") if payload.geography == "district" else None

    observations = _same_season_observations(frame, payload.season, metric)
    if payload.method == mp.METHOD_PERSONAL:
        origin, window = _personal_origin(payload, observations, crop_name)
    else:
        origin, window = _resolve_origin(
            observations, payload.origin_period, crop_name, payload.season
        )
    baseline_value, baseline_is_assumption, baseline_note = _baseline(
        payload, origin, window, metric
    )

    target_periods = mp.next_same_season_codes(origin["period_code"], payload.horizon_steps)
    cases = _cases(payload)

    results: list[ProjectionCaseResult] = []
    for case in cases:
        if payload.method == mp.METHOD_PERSONAL:
            points_values = [baseline_value] * payload.horizon_steps
            change_label = None
        elif payload.method == mp.METHOD_CARRY_FORWARD:
            points_values = mp.carry_forward(baseline_value, payload.horizon_steps)
            change_label = mp.COMPOUND_ONCE
        else:
            points_values = mp.percent_change(
                baseline_value, case["change_pct"], payload.horizon_steps, payload.compounding
            )
            change_label = payload.compounding
        points = []
        for code, value in zip(target_periods, points_values, strict=True):
            mp.ensure_positive_rate_result(baseline_value, value, metric)
            points.append(
                ProjectedPoint(
                    period_code=code,
                    period_label=period_service.label(code) if _is_coded(code) else code,
                    value=mp.round_value(value),
                    unit=unit,
                    is_planning_target=True,
                )
            )
        change_from = (
            None
            if baseline_value == 0
            else mp.round_value(100.0 * (points_values[-1] - baseline_value) / baseline_value)
        )
        results.append(
            ProjectionCaseResult(
                label=case["label"],
                change_pct=case["change_pct"],
                compounding=change_label,
                points=points,
                change_from_baseline_pct=change_from,
            )
        )

    baseline_observations = [BaselineObservation(**o["observation"]) for o in window]
    for obs in baseline_observations:
        obs.geography = f"district:{district_name}" if district_name else "national"

    evidence = [
        EvidenceReference(
            source_id=o["observation"]["source_id"],
            period_code=o["observation"]["period_code"],
            metric=metric,
            geography=f"district:{district_name}" if district_name else "national",
            value=o["observation"]["value"],
            unit=unit,
            value_kind="observed",
            source_workbook=o["observation"]["source_workbook"],
            source_sheets=o["observation"]["source_sheets"],
        )
        for o in window
    ]

    dataset_version = repo.expected_dataset_version()
    spec = {
        "crop": crop_name,
        "geography": payload.geography,
        "district": district_name,
        "season": payload.season,
        "origin_period": origin["period_code"],
        "horizon_steps": payload.horizon_steps,
        "metric": metric,
        "method": payload.method,
        "baseline": payload.baseline,
        "baseline_window": payload.baseline_window,
        "change_pct": payload.change_pct,
        "compounding": payload.compounding,
        "assumed_yield_kg_ha": payload.assumed_yield_kg_ha,
        "assumed_harvested_area_ha": payload.assumed_harvested_area_ha,
        "cases": [{"label": c.label, "change_pct": c.change_pct} for c in (payload.cases or [])],
    }

    warnings: list[str] = []
    if not observations:
        warnings.append(
            "no published same-season observation was found; this projection rests "
            "entirely on your stated assumption"
        )
    if payload.origin_period and origin["period_code"] != observations[-1]["period_code"]:
        warnings.append(
            f"a historical origin ({origin['period_code']}) was used: the baseline is "
            "restricted to observations at or before it, so later published releases "
            "were not used"
        )
    if payload.geography == "national":
        warnings.append(
            "this is a national projection; applying a national average to a farm is a "
            "planning assumption, not a farm-specific prediction"
        )

    limitations = [
        "this is a user-controlled projection, not an official NISR statistic and not a "
        "validated model forecast",
        "it answers what would follow from the stated baseline and assumptions, not what "
        "will happen",
        "the horizon is limited to a few same-season steps as a product safeguard, not "
        "because the method has been validated further out",
        "no irrigation, fertilizer, weather or budget response is modelled: this "
        "repository holds no measured evidence for those causal effects",
    ]
    if results and results[0].change_pct not in (None, 0.0):
        limitations.append(
            "a lower/main/higher band is three separate assumption cases, not a "
            "statistical confidence interval"
        )

    export_rows: list[ProjectionExportRow] = []
    for o in window:
        obs = o["observation"]
        export_rows.append(
            ProjectionExportRow(
                row_kind="observed_baseline",
                label=f"Observed baseline {obs['period_label']}",
                period_code=obs["period_code"],
                period_label=obs["period_label"],
                metric=metric,
                value=obs["value"],
                unit=unit,
                source_id=obs["source_id"],
                note="published NISR observation" if not baseline_is_assumption else None,
            )
        )
    if baseline_is_assumption:
        export_rows.append(
            ProjectionExportRow(
                row_kind="assumption",
                label="Assumed yield x assumed harvested area",
                metric=mp.METRIC_PRODUCTION,
                value=mp.round_value(baseline_value),
                unit=mp.METRIC_UNITS[mp.METRIC_PRODUCTION],
                note=(
                    f"yield {payload.assumed_yield_kg_ha} kg/ha x area "
                    f"{payload.assumed_harvested_area_ha} ha; a planning assumption"
                ),
            )
        )
    for result in results:
        for point in result.points:
            export_rows.append(
                ProjectionExportRow(
                    row_kind="projection",
                    label=f"Projection {point.period_label}",
                    period_code=point.period_code,
                    period_label=point.period_label,
                    metric=metric,
                    value=point.value,
                    unit=unit,
                    case=result.label,
                    note=(
                        "your assumption"
                        if result.change_pct
                        else "carried forward from the baseline"
                    ),
                )
            )

    return ManualProjectionResponse(
        calculation_id=_calculation_id(spec, dataset_version),
        value_kind=mp.VALUE_KIND,
        value_kind_label=mp.VALUE_KIND_LABEL,
        assumption_badge=mp.ASSUMPTION_BADGE,
        methodology_version=mp.METHODOLOGY_VERSION,
        dataset_version=dataset_version,
        method=payload.method,
        method_label=mp.METHOD_LABELS.get(payload.method, payload.method),
        method_note=mp.METHOD_NOTES.get(payload.method, ""),
        baseline=payload.baseline,
        baseline_label=mp.BASELINE_LABELS.get(payload.baseline, payload.baseline),
        baseline_value=mp.round_value(baseline_value),
        baseline_unit=unit,
        baseline_is_assumption=baseline_is_assumption,
        baseline_observations=baseline_observations,
        baseline_note=baseline_note,
        assumptions={
            "method": payload.method,
            "baseline": payload.baseline,
            "baseline_window": payload.baseline_window,
            "change_pct": payload.change_pct,
            "compounding": payload.compounding,
            "compounding_label": mp.COMPOUNDING_LABELS.get(payload.compounding, ""),
            "assumed_yield_kg_ha": payload.assumed_yield_kg_ha,
            "assumed_harvested_area_ha": payload.assumed_harvested_area_ha,
            "cases": spec["cases"],
        },
        cases=results,
        units=unit,
        resolved=ResolvedSelection(
            crop=crop_name,
            crop_code=crop_code,
            geography=payload.geography,
            district=district_name,
            province=province,
            season=payload.season,
            metric=metric,
            metric_unit=unit,
            origin_period=origin["period_code"],
            origin_label=period_service.label(origin["period_code"]),
            horizon_steps=payload.horizon_steps,
            target_periods=target_periods,
        ),
        evidence=evidence,
        rounding={
            "decimals": mp.ROUND_DECIMALS,
            "policy": (
                "projected values are rounded to 4 decimals for display; the echoed "
                "assumptions are unrounded so a result can be reproduced exactly"
            ),
        },
        warnings=warnings,
        limitations=limitations,
        export_rows=export_rows,
        provenance=Provenance(
            source_id=SOURCE_PANEL,
            source_period=origin["period_code"],
            method=(
                f"manual projection v{mp.METHODOLOGY_VERSION}: baseline "
                f"{baseline_note}; arithmetic only, no model, no imputation"
            ),
            limitations=limitations,
        ),
    )


def _is_coded(code: str) -> bool:
    try:
        mp.parse_period(code)
    except mp.ProjectionError:
        return False
    return True
