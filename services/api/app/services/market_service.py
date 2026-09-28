"""Verified market price reads.

The market domain is built to be correct with **zero** observations, because that
is its current and honest state: ``market_price_observation.csv`` is a designed,
registered schema (it carries a sha256 and a row count in the data manifest) with
no verified rows loaded and no market source registered.

Three rules hold here:

1. **No price is ever invented.** There is no sample data, no default, no
   interpolation and no "illustrative" value. An empty table produces an empty
   result plus an explanation of why it is empty.
2. **Price types are never blended.** Farmgate, producer, wholesale, retail,
   assembly and unspecified prices are different measurements of different things.
   Every aggregate groups by price type, or is explicitly filtered to one; a
   single blended "market price" is never produced.
3. **Synthetic rows never count as evidence.** Rows flagged ``is_synthetic`` are
   excluded from every statistic and reported separately, so a fixture can never
   be presented as an observed price.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.repositories import dataset_repository as repo

#: The price types the schema distinguishes. A value outside this set is kept as
#: published and flagged, never silently mapped onto a known type.
PRICE_TYPES: tuple[str, ...] = (
    "farmgate",
    "producer",
    "wholesale",
    "retail",
    "assembly",
    "unspecified",
)

#: Normalised value column, so a price is comparable across units and currencies.
VALUE_COLUMN = "price_rwf_per_kg"

_FILTER_COLUMNS = ("commodity_name_raw", "market_name", "district", "province", "price_type")

_OBSERVATION_COLUMNS = (
    "observation_key",
    "observation_date",
    "commodity_code",
    "commodity_name_raw",
    "variety",
    "quality_grade",
    "market_code",
    "market_name",
    "district",
    "province",
    "price_type",
    "price_type_raw",
    "price_value_original",
    "currency_original",
    "unit_original",
    "conversion_basis",
    VALUE_COLUMN,
    "source_id",
    "source_url",
    "is_synthetic",
)

NO_DATA_REASON = (
    "No verified market price observation is loaded. The schema is registered and "
    "ready, but no licensed, attributable price feed has been ingested, so "
    "Cropmatics shows a data-status view instead of prices."
)


def _table() -> tuple[pd.DataFrame, str | None]:
    """``(frame, error)``. An empty frame with no columns means unavailable."""
    try:
        return repo.market_observations(), None
    except Exception as exc:  # missing file, unreadable CSV
        return pd.DataFrame(), str(exc)


def _prepare(frame: pd.DataFrame) -> pd.DataFrame:
    """Normalise types without dropping or inventing anything."""
    out = frame.copy()
    if out.empty:
        return out

    if "observation_date" in out.columns:
        out["observation_date"] = pd.to_datetime(out["observation_date"], errors="coerce")
    if VALUE_COLUMN in out.columns:
        out[VALUE_COLUMN] = pd.to_numeric(out[VALUE_COLUMN], errors="coerce")
    if "price_value_original" in out.columns:
        out["price_value_original"] = pd.to_numeric(out["price_value_original"], errors="coerce")

    if "price_type" not in out.columns:
        out["price_type"] = "unspecified"
    out["price_type"] = (
        out["price_type"].astype("string").str.strip().str.lower().fillna("unspecified")
    )
    # A type the schema does not define is preserved verbatim and flagged.
    out["price_type_recognised"] = out["price_type"].isin(PRICE_TYPES)

    for column in _FILTER_COLUMNS:
        if column in out.columns:
            out[column] = out[column].astype("string").str.strip()

    if "is_synthetic" in out.columns:
        out["is_synthetic"] = out["is_synthetic"].fillna(False).astype(bool)
    else:
        out["is_synthetic"] = False

    return out


def _evidence(frame: pd.DataFrame) -> pd.DataFrame:
    """Rows that count as evidence: never synthetic."""
    if frame.empty:
        return frame
    return frame[~frame["is_synthetic"]]


def _records(df: pd.DataFrame, columns: tuple[str, ...] = _OBSERVATION_COLUMNS) -> list[dict]:
    if df.empty:
        return []
    present = [c for c in columns if c in df.columns]
    window = df[present].copy()
    for column in window.columns:
        if pd.api.types.is_datetime64_any_dtype(window[column]):
            window[column] = window[column].dt.strftime("%Y-%m-%d")
    return window.replace({np.nan: None}).to_dict(orient="records")


def _registered_sources() -> list[dict]:
    """Any market-related row in the source registry. Empty today, on purpose."""
    found: list[dict] = []
    for loader, label in ((repo.data_sources, "data_sources"), (repo.data_coverage, "data_coverage")):
        try:
            frame = loader()
        except Exception:
            continue
        if frame.empty or "dataset" not in frame.columns:
            continue
        matches = frame[frame["dataset"].astype(str).str.contains("market", case=False, na=False)]
        for _, row in matches.iterrows():
            found.append({"registry": label, **{k: (None if pd.isna(v) else v) for k, v in row.items()}})
    return found


def _manifest_entry() -> dict:
    try:
        outputs = repo.data_manifest().get("outputs") or {}
    except Exception:
        return {}
    entry = outputs.get("market_prices") or {}
    return {
        "file": entry.get("file"),
        "rows": entry.get("rows"),
        "sha256": entry.get("sha256"),
    }


def status() -> dict:
    """Everything a client needs to explain market data availability honestly."""
    frame, error = _table()
    prepared = _prepare(frame)
    evidence = _evidence(prepared)
    synthetic = int(prepared["is_synthetic"].sum()) if not prepared.empty else 0

    dates = evidence["observation_date"].dropna() if not evidence.empty else pd.Series(dtype="datetime64[ns]")
    date_coverage = None
    if not dates.empty:
        date_coverage = {
            "start": dates.min().strftime("%Y-%m-%d"),
            "end": dates.max().strftime("%Y-%m-%d"),
        }

    def distinct(column: str) -> list[str]:
        if evidence.empty or column not in evidence.columns:
            return []
        return sorted({str(v) for v in evidence[column].dropna() if str(v)})

    manifest = _manifest_entry()
    sources = _registered_sources()

    notes: list[str] = []
    if error:
        notes.append(f"The market table could not be read: {error}")
    elif prepared.empty:
        notes.append(NO_DATA_REASON)
    if synthetic:
        notes.append(
            f"{synthetic} row(s) in the market table are flagged synthetic and are "
            "excluded from every figure; they are fixtures, not observations."
        )
    if not sources:
        notes.append(
            "No market price source is registered in the source registry, so there "
            "is nothing attributable to display even once rows exist."
        )
    notes.append(
        "Price types (farmgate, producer, wholesale, retail, assembly, unspecified) "
        "are never combined; a price is only ever shown for the type it was "
        "reported as."
    )

    return {
        "data_available": bool(len(evidence)),
        "observations": int(len(evidence)),
        "rows_in_file": int(len(prepared)),
        "synthetic_rows": synthetic,
        "table_present": bool(len(prepared.columns)) and error is None,
        "schema_columns": list(prepared.columns) if not prepared.empty or not error else [],
        "reason": NO_DATA_REASON if not len(evidence) else None,
        "manifest": manifest,
        "registered_sources": sources,
        "date_coverage": date_coverage,
        "commodity_count": len(distinct("commodity_name_raw")),
        "market_count": len(distinct("market_name")),
        "district_count": len(distinct("district")),
        "province_count": len(distinct("province")),
        "price_types_present": distinct("price_type"),
        "price_types_supported": list(PRICE_TYPES),
        "notes": notes,
    }


def coverage() -> dict:
    """Per-dimension observation counts, from real rows only."""
    frame, error = _table()
    evidence = _evidence(_prepare(frame))

    def counts(column: str) -> list[dict]:
        if evidence.empty or column not in evidence.columns:
            return []
        grouped = evidence.dropna(subset=[column]).groupby(column).size()
        return [
            {"value": str(key), "observations": int(value)}
            for key, value in grouped.sort_values(ascending=False).items()
        ]

    price_type_counts = counts("price_type")
    unrecognised = (
        sorted(
            {
                str(v)
                for v in evidence.loc[~evidence["price_type_recognised"], "price_type"].dropna()
            }
        )
        if not evidence.empty
        else []
    )

    return {
        "data_available": bool(len(evidence)),
        "observations": int(len(evidence)),
        "error": error,
        "commodities": counts("commodity_name_raw"),
        "markets": counts("market_name"),
        "districts": counts("district"),
        "provinces": counts("province"),
        "price_types": price_type_counts,
        # Kept separate from the recognised list so an unexpected label is visible
        # rather than being folded into "unspecified".
        "unrecognised_price_types": unrecognised,
        "date_coverage": status()["date_coverage"],
        "reason": NO_DATA_REASON if not len(evidence) else None,
    }


def commodities() -> list[dict]:
    """Commodities that actually have observations, with their price types."""
    frame, _ = _table()
    evidence = _evidence(_prepare(frame))
    if evidence.empty:
        return []
    out: list[dict] = []
    for name, group in evidence.groupby("commodity_name_raw"):
        out.append(
            {
                "commodity": str(name),
                "commodity_code": _first(group, "commodity_code"),
                "observations": int(len(group)),
                "price_types": sorted({str(v) for v in group["price_type"].dropna()}),
                "markets": int(group["market_name"].nunique()) if "market_name" in group else 0,
            }
        )
    return sorted(out, key=lambda item: (-item["observations"], item["commodity"]))


def markets() -> list[dict]:
    """Reporting markets that actually have observations."""
    frame, _ = _table()
    evidence = _evidence(_prepare(frame))
    if evidence.empty:
        return []
    out: list[dict] = []
    for name, group in evidence.groupby("market_name"):
        out.append(
            {
                "market": str(name),
                "market_code": _first(group, "market_code"),
                "district": _first(group, "district"),
                "province": _first(group, "province"),
                "observations": int(len(group)),
                "commodities": int(group["commodity_name_raw"].nunique())
                if "commodity_name_raw" in group
                else 0,
                "price_types": sorted({str(v) for v in group["price_type"].dropna()}),
            }
        )
    return sorted(out, key=lambda item: (-item["observations"], item["market"]))


def _first(group: pd.DataFrame, column: str) -> str | None:
    if column not in group.columns:
        return None
    values = group[column].dropna()
    return None if values.empty else str(values.iloc[0])


def _apply_obs_filters(
    df: pd.DataFrame,
    *,
    commodity: str | None = None,
    market: str | None = None,
    district: str | None = None,
    province: str | None = None,
    price_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> pd.DataFrame:
    out = df
    for column, value in (
        ("commodity_name_raw", commodity),
        ("market_name", market),
        ("district", district),
        ("province", province),
        ("price_type", price_type),
    ):
        if value and column in out.columns:
            out = out[out[column].astype(str).str.lower() == str(value).strip().lower()]
    if date_from and "observation_date" in out.columns:
        out = out[out["observation_date"] >= pd.Timestamp(date_from)]
    if date_to and "observation_date" in out.columns:
        out = out[out["observation_date"] <= pd.Timestamp(date_to)]
    return out


def observations(
    *,
    commodity: str | None = None,
    market: str | None = None,
    district: str | None = None,
    province: str | None = None,
    price_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """Raw verified observations. Never blended, never imputed."""
    frame, error = _table()
    evidence = _evidence(_prepare(frame))
    filtered = _apply_obs_filters(
        evidence,
        commodity=commodity,
        market=market,
        district=district,
        province=province,
        price_type=price_type,
        date_from=date_from,
        date_to=date_to,
    )
    if not filtered.empty and "observation_date" in filtered.columns:
        filtered = filtered.sort_values("observation_date", ascending=False, kind="stable")

    total = int(len(filtered))
    window = filtered.iloc[offset : offset + limit] if total else filtered
    types = (
        sorted({str(v) for v in filtered["price_type"].dropna()}) if total else []
    )

    return {
        "data_available": bool(total),
        "total": total,
        "limit": limit,
        "offset": offset,
        "price_types_returned": types,
        # True when the page mixes types: rows still carry their own price_type, so
        # a client can never render a blended figure by accident.
        "mixes_price_types": len(types) > 1,
        "rows": _records(window),
        "error": error,
        "reason": NO_DATA_REASON if not total else None,
    }


def latest(
    *,
    commodity: str | None = None,
    market: str | None = None,
    district: str | None = None,
    province: str | None = None,
    price_type: str | None = None,
) -> dict:
    """Latest observed price per commodity x market x price type.

    Grouped by price type on purpose: a single "latest price" across farmgate and
    retail would be a number that describes no market.
    """
    frame, error = _table()
    evidence = _evidence(_prepare(frame))
    filtered = _apply_obs_filters(
        evidence,
        commodity=commodity,
        market=market,
        district=district,
        province=province,
        price_type=price_type,
    )

    rows: list[dict] = []
    if not filtered.empty and "observation_date" in filtered.columns:
        keys = ["commodity_name_raw", "market_name", "price_type"]
        keys = [k for k in keys if k in filtered.columns]
        usable = filtered.dropna(subset=["observation_date"])
        if not usable.empty:
            newest = usable.sort_values("observation_date", kind="stable").groupby(
                keys, dropna=False
            ).tail(1)
            rows = _records(newest.sort_values("observation_date", ascending=False, kind="stable"))

    return {
        "data_available": bool(rows),
        "count": len(rows),
        "rows": rows,
        "price_types_supported": list(PRICE_TYPES),
        "error": error,
        "reason": NO_DATA_REASON if not rows else None,
        "note": (
            "one row per commodity x market x price type; price types are never "
            "averaged together"
        ),
    }


def trend(
    *,
    commodity: str,
    market: str | None = None,
    district: str | None = None,
    price_type: str | None = None,
) -> dict:
    """One series per price type. A request that spans types returns several."""
    frame, error = _table()
    evidence = _evidence(_prepare(frame))
    filtered = _apply_obs_filters(
        evidence, commodity=commodity, market=market, district=district, price_type=price_type
    )
    filtered = filtered.dropna(subset=["observation_date"]) if not filtered.empty else filtered

    series: list[dict] = []
    if not filtered.empty:
        for (ptype,), group in filtered.groupby(["price_type"], dropna=False):
            points = (
                group.groupby("observation_date")[VALUE_COLUMN]
                .median()
                .dropna()
                .sort_index()
            )
            if points.empty:
                continue
            series.append(
                {
                    "price_type": str(ptype),
                    "unit": "RWF/kg",
                    "unit_basis": _first(group, "conversion_basis"),
                    "points": [
                        {"date": index.strftime("%Y-%m-%d"), "value": round(float(value), 2)}
                        for index, value in points.items()
                    ],
                    "n_observations": int(len(group)),
                }
            )

    return {
        "commodity": commodity,
        "market": market,
        "district": district,
        "data_available": bool(series),
        "series": series,
        "error": error,
        "reason": NO_DATA_REASON if not series else None,
        "note": (
            "a price series is returned per price type; combining them into one "
            "line would compare different measurements"
        ),
    }


def dispersion(
    *,
    commodity: str,
    market: str | None = None,
    district: str | None = None,
    price_type: str | None = None,
) -> dict:
    """Observed range per price type, with the observation count behind it."""
    frame, error = _table()
    evidence = _evidence(_prepare(frame))
    filtered = _apply_obs_filters(
        evidence, commodity=commodity, market=market, district=district, price_type=price_type
    )

    groups: list[dict] = []
    if not filtered.empty and VALUE_COLUMN in filtered.columns:
        for (ptype,), group in filtered.groupby(["price_type"], dropna=False):
            values = group[VALUE_COLUMN].dropna()
            if values.empty:
                continue
            groups.append(
                {
                    "price_type": str(ptype),
                    "unit": "RWF/kg",
                    "n_observations": int(len(values)),
                    "minimum": round(float(values.min()), 2),
                    "maximum": round(float(values.max()), 2),
                    "median": round(float(values.median()), 2),
                    "range": round(float(values.max() - values.min()), 2),
                    "markets": int(group["market_name"].nunique())
                    if "market_name" in group
                    else 0,
                }
            )

    return {
        "commodity": commodity,
        "market": market,
        "district": district,
        "data_available": bool(groups),
        "groups": sorted(groups, key=lambda item: item["price_type"]),
        "error": error,
        "reason": NO_DATA_REASON if not groups else None,
        "note": "reported per price type; a spread across types would be meaningless",
    }
