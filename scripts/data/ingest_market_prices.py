#!/usr/bin/env python3
"""Provider-neutral market price ingestion.

Reads price exports dropped under ``data/raw/markets/<provider>/`` and writes one
canonical observation table, so adding a provider never changes the application
schema.

Contract, in order of importance:

* **The original number is never overwritten.** ``price_value_original``,
  ``currency_original`` and ``unit_original`` are kept exactly as published.
  ``price_rwf_per_kg`` is filled in *only* when both the currency is RWF and a
  documented mass conversion exists; otherwise it stays null rather than being
  guessed. Every converted row records ``conversion_basis`` explaining the factor.
* **Nothing is inferred from a filename.** A market, commodity, currency or unit
  comes from a mapped column or an explicitly documented provider default.
  Anything else quarantines the row - it is not defaulted.
* **Provider semantics stay separate.** A FEWS NET ``Wholesale`` observation is
  never equated with a NISR farmer-reported selling price; ``price_type`` is a
  canonical bucket and ``price_type_raw`` keeps the provider's own word (a type
  with no canonical bucket becomes ``UNSPECIFIED``, never a guess).
* **Unresolvable input fails loudly.** A file whose required columns cannot be
  mapped quarantines every row, is reported, and exits non-zero, because a
  silently empty market table is worse than a stopped build.

Outputs:

* ``data/processed/market_price_observation.csv``  canonical observations
* ``data/interim/market_price_quarantine.csv``     every rejected row + why
* ``data/interim/market_price_report.json``        per-provider/file counts
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from scripts.data.common import (
    DATA_DIR,
    DICTS_DIR,
    INTERIM_DIR,
    PIPELINE_VERSION,
    PROCESSED_DIR,
    PROCESSED_FILES,
    RAW_MARKET_DIRS,
    log,
)
from scripts.data.normalize_crops import ALIASES as CROP_ALIASES

SCRIPT = "scripts/data/ingest_market_prices.py"
OUT = PROCESSED_FILES["market_prices"]
QUARANTINE = "market_price_quarantine.csv"
REPORT = "market_price_report.json"

# --- canonical vocabulary ---------------------------------------------------

PRICE_TYPES = ("FARMGATE", "PRODUCER", "WHOLESALE", "RETAIL", "ASSEMBLY", "UNSPECIFIED")

PRICE_TYPE_ALIASES: dict[str, str] = {
    "farm gate": "FARMGATE",
    "farmgate": "FARMGATE",
    "farm gate price": "FARMGATE",
    "producer": "PRODUCER",
    "producer price": "PRODUCER",
    "wholesale": "WHOLESALE",
    "wholesale price": "WHOLESALE",
    "retail": "RETAIL",
    "retail price": "RETAIL",
    "assembly": "ASSEMBLY",
    "assembly price": "ASSEMBLY",
    # Price types with no canonical bucket of their own. They are recorded as
    # UNSPECIFIED on purpose: classifying an "Export" or "Wage" quote as a
    # farmgate or retail price would misrepresent what was measured.
    "export": "UNSPECIFIED",
    "spot": "UNSPECIFIED",
    "wage": "UNSPECIFIED",
    "unspecified": "UNSPECIFIED",
}

# Documented mass conversions. Anything not listed here yields no kg price.
MASS_UNIT_TO_KG: dict[str, float] = {
    "kg": 1.0,
    "kgs": 1.0,
    "kilogram": 1.0,
    "kilograms": 1.0,
    "mt": 1000.0,
    "metric ton": 1000.0,
    "metric tonne": 1000.0,
    "tonne": 1000.0,
    "tonnes": 1000.0,
}

REQUIRED_FIELDS = ("observation_date", "commodity_name_raw", "price_value_original")

# Canonical output columns, in order.
CANONICAL_COLUMNS = [
    "observation_key",
    "observation_date",
    "commodity_code",
    "commodity_name_raw",
    "variety",
    "quality_grade",
    "market_code",
    "market_name",
    "district",
    "district_code",
    "province",
    "price_type",
    "price_type_raw",
    "price_value_original",
    "currency_original",
    "unit_original",
    "conversion_to_kg",
    "conversion_basis",
    "price_rwf_per_kg",
    "source_commodity_code",
    "source_unit_type",
    "source_product_source",
    "source_upstream_organization",
    "source_upstream_document",
    "source_id",
    "source_record_id",
    "source_file",
    "source_row",
    "source_url",
    "processing_script",
    "processing_version",
    "is_synthetic",
]

QUARANTINE_COLUMNS = [
    "source_id",
    "source_file",
    "source_row",
    "reason",
    "observation_date",
    "commodity_name_raw",
    "market_name",
    "price_value_original",
    "currency_original",
    "unit_original",
]

# Canonical field -> accepted source header aliases. Headers are compared after
# lower-casing and collapsing ``_``, ``-`` and whitespace, so ``period_date``,
# ``Period Date`` and ``period-date`` all match ``period date``.
FEWSNET_COLUMNS: dict[str, tuple[str, ...]] = {
    "observation_date": ("period date", "start date", "date"),
    "commodity_name_raw": ("product",),
    "market_name": ("market",),
    "market_code": ("market id",),
    "district": ("admin 2",),
    "province": ("admin 1",),
    "price_type_raw": ("price type",),
    "price_value_original": ("value",),
    "currency_original": ("currency",),
    "unit_original": ("unit",),
    "source_record_id": ("id",),
}

ESOKO_COLUMNS: dict[str, tuple[str, ...]] = {
    "observation_date": ("date", "price date", "observation date"),
    "commodity_name_raw": ("commodity", "commodity name", "product", "crop"),
    "market_name": ("market", "market name"),
    "district": ("district",),
    "province": ("province",),
    "price_type_raw": ("price type", "type"),
    "price_value_original": ("price", "average price", "avg price", "price rwf"),
    "currency_original": ("currency",),
    "unit_original": ("unit", "unit of measure", "measure"),
    "variety": ("variety",),
    "quality_grade": ("quality", "grade", "quality grade"),
    "source_record_id": ("id", "record id"),
    "conversion_to_kg": ("conversion to kg", "kg per unit", "units per kg"),
}

WFP_COLUMNS: dict[str, tuple[str, ...]] = {
    "observation_date": ("date", "price date"),
    "commodity_name_raw": ("commodity", "commodity name"),
    "market_name": ("market", "market name"),
    "market_code": ("market id",),
    "district": ("district", "admin 2"),
    "province": ("province", "admin 1"),
    "price_type_raw": ("pricetype", "price type"),
    "price_value_original": ("price", "value"),
    "currency_original": ("currency", "currency code"),
    "unit_original": ("unit", "unit name"),
    "source_record_id": ("id", "record id"),
}

# A reviewed NISR selling-price aggregate (e.g. the s2q28 Rwf/kg series) is
# accepted in canonical form: the microdata adapter owns the codebook mapping.
NISR_SAS_COLUMNS: dict[str, tuple[str, ...]] = {
    "observation_date": ("observation date", "date", "period date"),
    "commodity_name_raw": ("commodity", "crop", "commodity name"),
    "market_name": ("market", "market name"),
    "district": ("district",),
    "province": ("province",),
    "price_type_raw": ("price type",),
    "price_value_original": ("price rwf per kg", "price", "avg price", "average price"),
    "currency_original": ("currency",),
    "unit_original": ("unit",),
    "variety": ("variety",),
    "source_record_id": ("id", "record id"),
}


@dataclass(frozen=True)
class ProviderSpec:
    """One market price source and the aliases its export is known by.

    ``contract_verified`` records whether the alias list has been checked against
    a real export. ``False`` does not block ingestion - it labels the provider as
    unconfirmed, and an unmatched file still fails loudly through the quarantine
    report instead of being loaded on a guess.
    """

    key: str
    source_id: str
    publisher: str
    dataset_title: str
    source_url: str
    columns: dict[str, tuple[str, ...]]
    preserved: dict[str, tuple[str, ...]] = field(default_factory=dict)
    defaults: dict[str, str] = field(default_factory=dict)
    contract_verified: bool = True
    enabled: bool = True
    notes: str = ""


PROVIDERS: dict[str, ProviderSpec] = {
    "fewsnet": ProviderSpec(
        key="fewsnet",
        source_id="FEWSNET_MARKET_PRICES",
        publisher="FEWS NET (USAID)",
        dataset_title="FEWS NET Data Warehouse - market price facts",
        source_url="https://fdw.fews.net/api/marketpricefacts.csv",
        columns=FEWSNET_COLUMNS,
        preserved={
            # Provider-specific codes/attributes kept verbatim rather than
            # forced into a canonical field they do not mean.
            "source_commodity_code": ("cpcv2",),
            "source_unit_type": ("unit type",),
            "source_product_source": ("product source",),
            # FEWS NET republishes the original collector (for Rwanda the rows
            # name MINAGRI / e-Soko), so the upstream attribution is kept: it is
            # how a FEWS NET observation can be recognised as the same price a
            # direct e-Soko export carries.
            "source_upstream_organization": ("source organization",),
            "source_upstream_document": ("source document",),
        },
        notes=(
            "Column names verified against the public marketpricefacts.csv "
            "extract (period_date, market, product, price_type, unit, currency, "
            "value). Filter with country_code=RW when exporting. Rwanda rows are "
            "collected by MINAGRI/e-Soko and carry an empty admin_2, so "
            "district_code is legitimately null while the market name keeps the "
            "district (e.g. 'Bugesera, Ruhuha')."
        ),
    ),
    "esoko": ProviderSpec(
        key="esoko",
        source_id="MINAGRI_ESOKO",
        publisher="MINAGRI",
        dataset_title="e-Soko agricultural market prices",
        source_url="https://www.minagri.gov.rw/",
        columns=ESOKO_COLUMNS,
        defaults={"currency_original": "RWF"},
        contract_verified=False,
        notes=(
            "No documented public bulk API/export format. The alias list is a "
            "starting point and MUST be confirmed against the first real "
            "export; unmatched headers quarantine every row and stop the build."
        ),
    ),
    "wfp": ProviderSpec(
        key="wfp",
        source_id="WFP_DATABRIDGES",
        publisher="WFP VAM",
        dataset_title="WFP DataBridges market prices",
        source_url="https://github.com/WFP-VAM/DataBridgesKnots/",
        columns=WFP_COLUMNS,
        contract_verified=False,
        enabled=False,
        notes=(
            "DataBridges requires API credentials issued to authorised users. "
            "Disabled by default: enable once an authorised export is placed here."
        ),
    ),
    "nisr_sas": ProviderSpec(
        key="nisr_sas",
        source_id="NISR_SAS_MARKET_PRICES",
        publisher="NISR",
        dataset_title="NISR SAS farmer selling prices",
        source_url="https://microdata.statistics.gov.rw/",
        columns=NISR_SAS_COLUMNS,
        defaults={"currency_original": "RWF", "unit_original": "kg"},
        notes=(
            "Reviewed aggregate of the restricted microdata (s2q28 is published "
            "as Rwf per kilogram), so currency/unit are documented defaults. "
            "Respondent-level files must never be dropped here."
        ),
    ),
}

CSV_SUFFIXES = {".csv", ".tsv", ".txt"}
EXCEL_SUFFIXES = {".xlsx", ".xls"}


def _rel(path: Path) -> str:
    """Repository-relative POSIX path, so lineage rows are portable."""
    try:
        return path.resolve().relative_to(DATA_DIR.parent).as_posix()
    except ValueError:
        return path.as_posix()


# --- helpers ----------------------------------------------------------------


def normalize_header(value: object) -> str:
    """Header key: lower-cased, separators collapsed (``period_date`` -> ``period date``)."""
    text = str(value).replace("\ufeff", "").strip().lower()
    for sep in ("_", "-", "/", "."):
        text = text.replace(sep, " ")
    return " ".join(text.split())


def normalize_price_type(value: object) -> tuple[str, str]:
    """``(canonical bucket, provider's own word)``."""
    raw = " ".join(str(value or "").replace("_", " ").split()).strip()
    if not raw:
        return "UNSPECIFIED", ""
    return PRICE_TYPE_ALIASES.get(raw.lower(), "UNSPECIFIED"), raw


def observation_key(parts: list[object]) -> str:
    """Stable identity of an observation, so re-exports collapse instead of duplicating."""
    payload = "|".join("" if p is None else str(p).strip() for p in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_dictionaries() -> tuple[dict[str, str], dict[str, str]]:
    """``(crop name -> code, district name -> code)``, both case-insensitive."""
    crops = pd.read_csv(DICTS_DIR / "crops.csv")
    districts = pd.read_csv(DICTS_DIR / "districts.csv")

    crop_lookup: dict[str, str] = {}
    for row in crops.itertuples():
        crop_lookup[str(row.crop_name).strip().lower()] = str(row.crop_code)
    # Aliases resolve provider wording ("Cooking banana") to the dictionary crop.
    for alias, canonical in CROP_ALIASES.items():
        code = crop_lookup.get(str(canonical).strip().lower())
        if code:
            crop_lookup.setdefault(str(alias).strip().lower(), code)

    district_lookup = {
        str(row.district).strip().lower(): str(row.district_code)
        for row in districts.itertuples()
    }
    return crop_lookup, district_lookup


def _read_file(path: Path) -> pd.DataFrame:
    """Read an export as strings: nothing is coerced or trimmed on the way in."""
    if path.suffix.lower() in EXCEL_SUFFIXES:
        return pd.read_excel(path, dtype=str, keep_default_na=False)
    return pd.read_csv(
        path,
        dtype=str,
        keep_default_na=False,
        encoding="utf-8-sig",
        sep="\t" if path.suffix.lower() == ".tsv" else ",",
    )


def resolve_columns(
    frame: pd.DataFrame, spec: ProviderSpec
) -> tuple[dict[str, str], dict[str, str], list[str]]:
    """Map the file's headers onto canonical fields.

    Returns ``(canonical -> source header, preserved output col -> source header,
    unresolved required fields)``.
    """
    by_normalized = {normalize_header(column): str(column) for column in frame.columns}
    resolved: dict[str, str] = {}
    for canonical_field, aliases in spec.columns.items():
        for alias in aliases:
            source = by_normalized.get(normalize_header(alias))
            if source is not None:
                resolved[canonical_field] = source
                break

    preserved: dict[str, str] = {}
    for output_col, aliases in spec.preserved.items():
        for alias in aliases:
            source = by_normalized.get(normalize_header(alias))
            if source is not None:
                preserved[output_col] = source
                break

    unresolved = [f for f in REQUIRED_FIELDS if f not in resolved]
    return resolved, preserved, unresolved


def _text(value: object) -> str:
    """Cell as publishable text: trimmed, internal whitespace collapsed."""
    return " ".join(str(value or "").replace("\ufeff", "").split())


def _mass_conversion(unit: str, explicit: object = None) -> tuple[float | None, str]:
    """``(factor, basis)`` - only documented conversions, never an estimate."""
    if explicit is not None and _text(explicit):
        try:
            factor = float(_text(explicit).replace(",", ""))
        except ValueError:
            return None, ""
        if factor > 0:
            return factor, f"explicit conversion_to_kg column = {factor}"
        return None, ""

    key = _text(unit).lower().rstrip(".")
    factor = MASS_UNIT_TO_KG.get(key)
    if factor is None:
        return None, ""
    if factor == 1.0:
        return factor, f"unit '{unit}' is a kilogram"
    return factor, f"unit '{unit}' = {factor:g} kg (documented mass conversion)"


def _quarantine_row(
    spec: ProviderSpec,
    path: Path,
    row_number: int,
    reason: str,
    record: dict,
) -> dict:
    """One rejected row plus enough of its content to diagnose it.

    ``record`` is keyed by canonical field name (the caller maps the file's own
    headers first), so the quarantine file shows the published date, commodity,
    price, currency and unit even when one of them is what was wrong.
    """

    def value(field: str) -> str:
        source = record.get(field)
        return _text(source) if source is not None else ""

    return {
        "source_id": spec.source_id,
        "source_file": _rel(path),
        "source_row": row_number,
        "reason": reason,
        "observation_date": value("observation_date"),
        "commodity_name_raw": value("commodity_name_raw"),
        "market_name": value("market_name"),
        "price_value_original": value("price_value_original"),
        "currency_original": value("currency_original"),
        "unit_original": value("unit_original"),
    }


def normalize_file(path: Path, spec: ProviderSpec) -> dict:
    """Normalize one provider file.

    Returns a dict with ``rows`` (canonical observations), ``quarantine`` (rejected
    rows), ``unresolved`` (required columns that could not be mapped) and counts.
    """
    report: dict = {
        "file": _rel(path),
        "rows_read": 0,
        "rows_kept": 0,
        "rows_quarantined": 0,
        "duplicates": 0,
        "unresolved_columns": [],
        "status": "ok",
    }

    try:
        frame = _read_file(path)
    except Exception as exc:  # unreadable export is an operational failure
        report["status"] = "unreadable"
        report["error"] = f"{type(exc).__name__}: {exc}"
        log(f"ERROR {spec.key}: cannot read {path.name}: {exc}")
        return {"rows": [], "quarantine": [], "unresolved": [], "report": report}

    resolved, preserved, unresolved = resolve_columns(frame, spec)
    report["rows_read"] = int(len(frame))
    report["resolved_columns"] = {k: v for k, v in sorted(resolved.items())}
    report["unresolved_columns"] = unresolved
    if unresolved:
        report["status"] = "unresolved-columns"
        log(
            f"ERROR {spec.key}: {path.name} is missing required columns "
            f"{unresolved}; headers found: {[str(c) for c in frame.columns][:12]}"
        )
        quarantine = [
            _quarantine_row(
                spec,
                path,
                number,
                "unresolved required columns: " + ", ".join(unresolved),
                {
                    field: (record.get(source) if source else None)
                    for field, source in resolved.items()
                },
            )
            for number, record in enumerate(frame.to_dict("records"), start=2)
        ]
        report["rows_quarantined"] = len(quarantine)
        return {"rows": [], "quarantine": quarantine, "unresolved": unresolved, "report": report}

    crop_lookup, district_lookup = _load_dictionaries()

    def canonical_view(record: dict) -> dict[str, str]:
        """The row keyed by canonical field name, values untouched apart from trim."""
        return {
            field: _text(record.get(source)) for field, source in resolved.items()
        }

    def defaults_for(view: dict[str, str], field: str) -> str:
        """Mapped value, else an explicitly documented provider default, else blank."""
        return view.get(field, "") or spec.defaults.get(field, "")

    def preserved_view(record: dict) -> dict[str, str]:
        """Provider-specific attributes kept verbatim (codes, upstream source)."""
        return {out: _text(record.get(source)) for out, source in preserved.items()}

    rows: list[dict] = []
    quarantine: list[dict] = []

    def reject(number: int, view: dict, reason: str) -> None:
        quarantine.append(_quarantine_row(spec, path, number, reason, view))

    for number, record in enumerate(frame.to_dict("records"), start=2):
        view = canonical_view(record)
        extra = preserved_view(record)

        raw_date = view.get("observation_date", "")
        parsed_date = pd.to_datetime(raw_date, errors="coerce", dayfirst=False)
        if pd.isna(parsed_date):
            reject(number, view, f"unparseable observation_date: {raw_date!r}")
            continue

        commodity = view.get("commodity_name_raw", "")
        if not commodity:
            reject(number, view, "missing commodity name")
            continue

        raw_price = view.get("price_value_original", "")
        price = pd.to_numeric(raw_price.replace(",", ""), errors="coerce")
        if pd.isna(price):
            reject(number, view, f"non-numeric price value: {raw_price!r}")
            continue
        if price < 0:
            reject(number, view, f"negative price value: {raw_price!r}")
            continue

        currency = defaults_for(view, "currency_original")
        if not currency:
            reject(
                number,
                view,
                "unknown currency (not in the file and no documented provider default)",
            )
            continue
        unit = defaults_for(view, "unit_original")
        if not unit:
            reject(
                number,
                view,
                "unknown unit (not in the file and no documented provider default)",
            )
            continue

        market_name = view.get("market_name", "")
        market_code = view.get("market_code", "")
        district = view.get("district", "")
        commodity_code = crop_lookup.get(commodity.strip().lower(), "")
        district_code = district_lookup.get(district.strip().lower(), "")

        price_type, price_type_raw = normalize_price_type(view.get("price_type_raw", ""))
        factor, basis = _mass_conversion(unit, view.get("conversion_to_kg"))

        canonical_price = None
        if factor and currency.strip().upper() == "RWF":
            canonical_price = float(price) / factor
        elif factor:
            # A kg conversion exists but the quote is not in RWF: converting
            # would need an exchange rate this pipeline does not have.
            basis = f"{basis}; price_rwf_per_kg left null (currency is {currency})"

        rows.append(
            {
                "observation_key": observation_key(
                    [
                        spec.source_id,
                        parsed_date.date().isoformat(),
                        market_code or market_name,
                        commodity,
                        price_type,
                        price,
                        unit,
                        currency,
                    ]
                ),
                "observation_date": parsed_date.date().isoformat(),
                "commodity_code": commodity_code or None,
                "commodity_name_raw": commodity,
                "variety": view.get("variety") or None,
                "quality_grade": view.get("quality_grade") or None,
                "market_code": market_code or None,
                "market_name": market_name or None,
                "district": district or None,
                "district_code": district_code or None,
                "province": view.get("province") or None,
                "price_type": price_type,
                "price_type_raw": price_type_raw or None,
                "price_value_original": float(price),
                "currency_original": currency,
                "unit_original": unit,
                "conversion_to_kg": factor,
                "conversion_basis": basis,
                "price_rwf_per_kg": canonical_price,
                "source_commodity_code": extra.get("source_commodity_code") or None,
                "source_unit_type": extra.get("source_unit_type") or None,
                "source_product_source": extra.get("source_product_source") or None,
                "source_upstream_organization": extra.get("source_upstream_organization")
                or None,
                "source_upstream_document": extra.get("source_upstream_document") or None,
                "source_id": spec.source_id,
                "source_record_id": view.get("source_record_id") or None,
                "source_file": _rel(path),
                "source_row": number,
                "source_url": spec.source_url,
                "processing_script": SCRIPT,
                "processing_version": PIPELINE_VERSION,
                "is_synthetic": False,
            }
        )

    # Provider duplicates collapse on the stable observation key. The dropped
    # copies are reported rather than vanishing.
    if rows:
        frame_out = pd.DataFrame(rows)
        duplicate_mask = frame_out.duplicated("observation_key", keep="first")
        for record in frame_out[duplicate_mask].to_dict("records"):
            quarantine.append(
                {
                    "source_id": spec.source_id,
                    "source_file": _rel(path),
                    "source_row": record["source_row"],
                    "reason": "duplicate observation (same stable observation_key)",
                    "observation_date": record["observation_date"],
                    "commodity_name_raw": record["commodity_name_raw"],
                    "market_name": record["market_name"],
                    "price_value_original": record["price_value_original"],
                    "currency_original": record["currency_original"],
                    "unit_original": record["unit_original"],
                }
            )
        report["duplicates"] = int(duplicate_mask.sum())
        rows = frame_out[~duplicate_mask].to_dict("records")

    report["rows_kept"] = len(rows)
    report["rows_quarantined"] += len(quarantine)
    return {"rows": rows, "quarantine": quarantine, "unresolved": unresolved, "report": report}


def _provider_files(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(
        path
        for path in folder.rglob("*")
        if path.is_file()
        and path.suffix.lower() in (CSV_SUFFIXES | EXCEL_SUFFIXES)
        and not path.name.startswith(".")
    )


def main() -> int:
    all_rows: list[dict] = []
    all_quarantine: list[dict] = []
    provider_reports: dict[str, dict] = {}
    failures: list[str] = []

    for key in sorted(PROVIDERS):
        spec = PROVIDERS[key]
        folder = RAW_MARKET_DIRS[key]
        files = _provider_files(folder)

        entry: dict = {
            "source_id": spec.source_id,
            "publisher": spec.publisher,
            "contract_verified": spec.contract_verified,
            "enabled": spec.enabled,
            "files": [_rel(p) for p in files],
            "rows_kept": 0,
            "rows_quarantined": 0,
            "duplicates": 0,
            "unresolved_columns": [],
        }

        if not files:
            entry["status"] = "no-files"
            provider_reports[key] = entry
            continue

        if not spec.enabled:
            entry["status"] = "skipped-disabled"
            log(
                f"WARN {key}: {len(files)} file(s) present but the provider is "
                f"disabled - {spec.notes}"
            )
            provider_reports[key] = entry
            continue

        file_reports: list[dict] = []
        for path in files:
            result = normalize_file(path, spec)
            all_rows.extend(result["rows"])
            all_quarantine.extend(result["quarantine"])
            file_reports.append(result["report"])
            entry["rows_kept"] += result["report"]["rows_kept"]
            entry["rows_quarantined"] += result["report"]["rows_quarantined"]
            entry["duplicates"] += result["report"]["duplicates"]
            entry["unresolved_columns"] = sorted(
                set(entry["unresolved_columns"]) | set(result["unresolved"])
            )
            if result["report"]["status"] == "unreadable":
                failures.append(f"{key}: cannot read {path.name}")
            elif result["unresolved"]:
                failures.append(
                    f"{key}: {path.name} has no mapping for {result['unresolved']}"
                )

        entry["status"] = "ingested"
        entry["file_reports"] = file_reports
        if not spec.contract_verified:
            entry["contract_note"] = (
                "column aliases not yet verified against a real export"
            )
            log(
                f"WARN {key}: alias contract is unverified; ingested "
                f"{entry['rows_kept']} rows - confirm the column mapping"
            )
        provider_reports[key] = entry

    observations = pd.DataFrame(all_rows, columns=CANONICAL_COLUMNS)
    if not observations.empty:
        observations = observations.sort_values(
            ["observation_date", "source_id", "market_name", "commodity_name_raw"],
            kind="stable",
            na_position="last",
        ).reset_index(drop=True)

    quarantine = pd.DataFrame(all_quarantine, columns=QUARANTINE_COLUMNS)

    if observations.empty:
        unresolved_commodities: list[str] = []
        unresolved_districts: list[str] = []
    else:
        # A market observation with no dictionary code stays usable and raw; the
        # report lists it so the mapping gap is visible instead of silent.
        unresolved_commodities = sorted(
            str(name)
            for name in observations.loc[
                observations["commodity_code"].isna(), "commodity_name_raw"
            ].unique()
        )
        unresolved_districts = sorted(
            str(name)
            for name in observations.loc[
                observations["district_code"].isna()
                & observations["district"].notna(),
                "district",
            ].unique()
        )

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    observations.to_csv(PROCESSED_DIR / OUT, index=False)
    quarantine.to_csv(INTERIM_DIR / QUARANTINE, index=False)

    report = {
        "pipeline_version": PIPELINE_VERSION,
        "providers": provider_reports,
        "totals": {
            "observations": int(len(observations)),
            "quarantined": int(len(quarantine)),
            "canonical_price_available": int(
                observations["price_rwf_per_kg"].notna().sum() if not observations.empty else 0
            ),
            "providers_with_data": sorted(
                key for key, entry in provider_reports.items() if entry["rows_kept"]
            ),
        },
        "unresolved": {
            "commodities": unresolved_commodities,
            "districts": unresolved_districts,
        },
        "failures": failures,
    }
    (INTERIM_DIR / REPORT).write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    if observations.empty and not any(e["files"] for e in provider_reports.values()):
        log(
            f"no provider files under data/raw/markets/*/ - wrote the canonical "
            f"schema with 0 rows to {OUT}"
        )

    if not quarantine.empty:
        reasons = quarantine["reason"].value_counts().to_dict()
        log(f"quarantined {len(quarantine)} row(s): {reasons}")
    if unresolved_commodities:
        log(
            f"INFO commodities with no crop dictionary code (kept raw, code null): "
            f"{unresolved_commodities}"
        )
    if unresolved_districts:
        log(
            f"INFO districts with no district code (kept raw, code null): "
            f"{unresolved_districts}"
        )
    log(
        f"built {OUT}: {len(observations)} observations from "
        f"{report['totals']['providers_with_data'] or 'no'} provider(s); "
        f"report -> data/interim/{REPORT}"
    )

    if failures:
        for failure in failures:
            log(f"ERROR {failure}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
