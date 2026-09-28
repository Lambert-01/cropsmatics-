"""Market price ingestion tests.

Every fixture here is fabricated in a temporary directory (marked SYNTHETIC) and
only ever passed straight to the adapter functions - nothing synthetic is loaded
into ``data/processed/`` and nothing official is copied around.

The tests assert the contract that makes multi-provider prices safe to compare:
original values are preserved, a RWF/kg figure needs both a documented mass
conversion and an RWF quote, unusable rows quarantine with a reason instead of
being defaulted, and repeated exports collapse on a stable observation key.
"""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.data import ingest_market_prices as mp
from scripts.data.common import PROCESSED_FILES, RAW_MARKET_DIRS

SYNTHETIC = "SYNTHETIC FIXTURE - not real data"

# The real FEWS NET marketpricefacts.csv header set (verified against the public
# extract), carrying synthetic values.
FEWSNET_HEADERS = [
    "country",
    "country_code",
    "admin_1",
    "admin_2",
    "fnid",
    "market",
    "market_id",
    "cpcv2",
    "product",
    "product_source",
    "period_date",
    "price_type",
    "unit",
    "unit_type",
    "currency",
    "value",
    "source_organization",
    "source_document",
    "start_date",
    "id",
]


def write_csv(tmp_path, name: str, headers: list[str], rows: list[list[str]]):
    path = tmp_path / name
    frame = pd.DataFrame(rows, columns=headers)
    frame.to_csv(path, index=False)
    return path


def fewsnet_row(
    *,
    market: str = "Kigali",
    market_id: str = "57824",
    product: str = "Maize",
    price_type: str = "Wholesale",
    unit: str = "KG",
    currency: str = "RWF",
    value: str = "450",
    period_date: str = "2026-08-15",
    district: str = "Nyarugenge",
    record_id: str = "1",
) -> list[str]:
    values = {
        "country": "Rwanda",
        "country_code": "RW",
        "admin_1": SYNTHETIC,
        "admin_2": district,
        "fnid": "RW",
        "market": market,
        "market_id": market_id,
        "cpcv2": "L02121",
        "product": product,
        "product_source": "Local",
        "period_date": period_date,
        "price_type": price_type,
        "unit": unit,
        "unit_type": "Mass",
        "currency": currency,
        "value": value,
        # Rwanda rows are collected by MINAGRI/e-Soko and republished by FEWS NET.
        "source_organization": "Ministry of Agriculture and Animal Resources, Rwanda",
        "source_document": "Ministry of Agriculture and Animal Resources, E-Soko, Rwanda, Price",
        "start_date": period_date,
        "id": record_id,
    }
    return [values[header] for header in FEWSNET_HEADERS]


def normalize(path, provider: str = "fewsnet") -> dict:
    return mp.normalize_file(path, mp.PROVIDERS[provider])


# --- value preservation and conversion --------------------------------------


def test_original_price_currency_and_unit_are_preserved(tmp_path):
    path = write_csv(tmp_path, "fewsnet.csv", FEWSNET_HEADERS, [fewsnet_row()])
    result = normalize(path)

    assert result["report"]["status"] == "ok"
    assert len(result["rows"]) == 1
    row = result["rows"][0]

    assert row["price_value_original"] == 450.0
    assert row["currency_original"] == "RWF"
    assert row["unit_original"] == "KG"
    assert row["observation_date"] == "2026-08-15"
    assert row["commodity_name_raw"] == "Maize"
    assert row["market_name"] == "Kigali"
    assert row["market_code"] == "57824"
    assert row["source_commodity_code"] == "L02121"
    assert row["source_unit_type"] == "Mass"
    assert row["source_product_source"] == "Local"
    # The upstream collector is kept, so a FEWS NET row that is really an e-Soko
    # price is recognisable as such.
    assert "MINAGRI" in row["source_upstream_organization"] or "Agriculture" in row[
        "source_upstream_organization"
    ]
    assert "E-Soko" in row["source_upstream_document"]
    assert row["source_record_id"] == "1"
    assert row["source_id"] == "FEWSNET_MARKET_PRICES"
    assert row["source_row"] == 2


def test_documented_kg_conversion_only(tmp_path):
    path = write_csv(
        tmp_path,
        "fewsnet.csv",
        FEWSNET_HEADERS,
        [
            fewsnet_row(unit="KG", value="450", record_id="1"),
            fewsnet_row(unit="MT", value="450000", record_id="2"),
            fewsnet_row(unit="Head", value="9000", record_id="3"),
            fewsnet_row(unit="KG", currency="USD", value="0.5", record_id="4"),
        ],
    )
    rows = pd.DataFrame(normalize(path)["rows"]).set_index("source_record_id")

    assert rows.loc["1", "conversion_to_kg"] == 1.0
    assert rows.loc["1", "price_rwf_per_kg"] == 450.0
    assert "kilogram" in rows.loc["1", "conversion_basis"]

    assert rows.loc["2", "conversion_to_kg"] == 1000.0
    assert rows.loc["2", "price_rwf_per_kg"] == 450.0
    assert "1000 kg" in rows.loc["2", "conversion_basis"]

    # A unit with no documented mass conversion never becomes a kg price.
    assert pd.isna(rows.loc["3", "conversion_to_kg"])
    assert pd.isna(rows.loc["3", "price_rwf_per_kg"])

    # A kg conversion exists, but a USD quote needs an FX rate we do not have.
    assert rows.loc["4", "conversion_to_kg"] == 1.0
    assert pd.isna(rows.loc["4", "price_rwf_per_kg"])
    assert "currency" in rows.loc["4", "conversion_basis"]


def test_price_type_is_bucketed_and_the_provider_wording_kept(tmp_path):
    path = write_csv(
        tmp_path,
        "fewsnet.csv",
        FEWSNET_HEADERS,
        [
            fewsnet_row(price_type="Wholesale", record_id="1"),
            fewsnet_row(price_type="Farm Gate", record_id="2"),
            fewsnet_row(price_type="Export", record_id="3"),
        ],
    )
    rows = pd.DataFrame(normalize(path)["rows"]).set_index("source_record_id")

    assert rows.loc["1", "price_type"] == "WHOLESALE"
    assert rows.loc["2", "price_type"] == "FARMGATE"
    # No canonical bucket exists for an export quote; it is not filed as retail.
    assert rows.loc["3", "price_type"] == "UNSPECIFIED"
    assert rows.loc["3", "price_type_raw"] == "Export"


def test_commodity_and_district_resolve_against_the_dictionaries(tmp_path):
    path = write_csv(
        tmp_path,
        "fewsnet.csv",
        FEWSNET_HEADERS,
        [
            fewsnet_row(product="Maize", district="Nyarugenge", record_id="1"),
            fewsnet_row(product="Amaranth leaves", district="Nowhere", record_id="2"),
        ],
    )
    rows = pd.DataFrame(normalize(path)["rows"]).set_index("source_record_id")

    assert rows.loc["1", "commodity_code"] == "CROP-MAI"
    assert rows.loc["1", "district_code"] == "RW-KG-NYA"

    # Unmatched labels stay raw with a null code - never invented.
    assert pd.isna(rows.loc["2", "commodity_code"])
    assert rows.loc["2", "commodity_name_raw"] == "Amaranth leaves"
    assert pd.isna(rows.loc["2", "district_code"])
    assert rows.loc["2", "district"] == "Nowhere"


# --- quarantine, never defaults ---------------------------------------------


def test_unusable_rows_are_quarantined_with_a_reason(tmp_path):
    path = write_csv(
        tmp_path,
        "fewsnet.csv",
        FEWSNET_HEADERS,
        [
            fewsnet_row(period_date="not-a-date", record_id="1"),
            fewsnet_row(value="not-a-number", record_id="2"),
            fewsnet_row(value="-3", record_id="3"),
            fewsnet_row(product="", record_id="4"),
            fewsnet_row(currency="", record_id="5"),
            fewsnet_row(unit="", record_id="6"),
            fewsnet_row(record_id="7"),
        ],
    )
    result = normalize(path)

    assert len(result["rows"]) == 1, "only the fully usable row is kept"
    quarantine = pd.DataFrame(result["quarantine"])
    reasons = " | ".join(quarantine["reason"])
    assert "unparseable observation_date" in reasons
    assert "non-numeric price" in reasons
    assert "negative price" in reasons
    assert "missing commodity" in reasons
    assert "unknown currency" in reasons
    assert "unknown unit" in reasons
    assert len(quarantine) == 6
    assert set(quarantine["source_id"]) == {"FEWSNET_MARKET_PRICES"}


def test_unknown_headers_quarantine_every_row_and_report_the_gap(tmp_path):
    path = write_csv(
        tmp_path,
        "mystery_export.csv",
        ["alpha", "beta", "gamma"],
        [["1", "2", "3"], ["4", "5", "6"]],
    )
    result = normalize(path)

    assert result["rows"] == []
    assert result["unresolved"] == list(mp.REQUIRED_FIELDS)
    assert result["report"]["status"] == "unresolved-columns"
    assert result["report"]["rows_quarantined"] == 2
    assert all("unresolved required columns" in row["reason"] for row in result["quarantine"])


def test_repeated_export_rows_collapse_on_the_stable_key(tmp_path):
    duplicate = fewsnet_row()
    path = write_csv(
        tmp_path,
        "fewsnet.csv",
        FEWSNET_HEADERS,
        [duplicate, list(duplicate)],
    )
    result = normalize(path)

    assert len(result["rows"]) == 1
    assert result["report"]["duplicates"] == 1
    assert "duplicate observation" in result["quarantine"][0]["reason"]


# --- provider defaults ------------------------------------------------------


def test_provider_defaults_cover_currency_but_never_an_unknown_unit(tmp_path):
    esoko_headers = ["Date", "Commodity", "Market", "District", "Unit", "Price"]
    path = write_csv(
        tmp_path,
        "esoko.csv",
        esoko_headers,
        [
            ["2026-09-01", "Beans", "Nyabugogo", "Nyarugenge", "kg", "1200"],
            ["2026-09-02", "Beans", "Nyabugogo", "Nyarugenge", "sack", "45000"],
        ],
    )
    rows = pd.DataFrame(normalize(path, "esoko")["rows"])

    # e-Soko is a Rwandan price system, so RWF is a documented default...
    assert set(rows["currency_original"]) == {"RWF"}
    # ...but a "sack" has no documented kilogram equivalent, so no kg price.
    sack = rows[rows["unit_original"] == "sack"].iloc[0]
    assert pd.isna(sack["conversion_to_kg"])
    assert pd.isna(sack["price_rwf_per_kg"])

    # Without a unit column at all, the rows quarantine instead of guessing.
    no_unit = write_csv(
        tmp_path,
        "esoko_no_unit.csv",
        ["Date", "Commodity", "Market", "Price"],
        [["2026-09-01", "Beans", "Nyabugogo", "1200"]],
    )
    result = normalize(no_unit, "esoko")
    assert result["rows"] == []
    assert any("unknown unit" in row["reason"] for row in result["quarantine"])


def test_nisr_selling_price_defaults_match_the_published_unit(tmp_path):
    path = write_csv(
        tmp_path,
        "nisr_selling_prices.csv",
        ["observation_date", "commodity", "district", "price_rwf_per_kg"],
        [["2026-06-30", "Maize", "Gasabo", "320"]],
    )
    rows = normalize(path, "nisr_sas")["rows"]

    assert len(rows) == 1
    assert rows[0]["currency_original"] == "RWF"
    assert rows[0]["unit_original"] == "kg"
    assert rows[0]["price_rwf_per_kg"] == 320.0
    assert rows[0]["source_id"] == "NISR_SAS_MARKET_PRICES"


# --- provider contract ------------------------------------------------------


def test_every_provider_has_a_raw_directory_and_canonical_vocabulary():
    assert set(mp.PROVIDERS) == set(RAW_MARKET_DIRS)
    assert set(mp.PRICE_TYPE_ALIASES.values()) <= set(mp.PRICE_TYPES)
    for spec in mp.PROVIDERS.values():
        assert spec.source_id
        assert set(mp.REQUIRED_FIELDS) <= set(spec.columns)
        for aliases in spec.columns.values():
            assert aliases, spec.key
    # FEWS NET column names were verified against the real extract; the e-Soko
    # and WFP contracts are explicitly flagged as unconfirmed.
    assert mp.PROVIDERS["fewsnet"].contract_verified
    assert not mp.PROVIDERS["esoko"].contract_verified
    assert not mp.PROVIDERS["wfp"].enabled


def test_market_output_paths_are_the_registered_ones():
    assert mp.OUT == PROCESSED_FILES["market_prices"]
    assert mp.QUARANTINE == "market_price_quarantine.csv"


# --- the shipped table (when the pipeline has run) --------------------------


def test_shipped_table_respects_the_conversion_rules(processed_dir):
    from scripts.tests.conftest import require

    df = pd.read_csv(require(processed_dir / PROCESSED_FILES["market_prices"]))
    assert set(mp.CANONICAL_COLUMNS) <= set(df.columns)
    if df.empty:
        pytest.skip("no provider export has been ingested yet")

    assert not df["observation_key"].duplicated().any()
    assert set(df["price_type"]) <= set(mp.PRICE_TYPES)
    converted = df["price_rwf_per_kg"].notna()
    assert df.loc[converted, "conversion_to_kg"].notna().all()
    assert (df.loc[converted, "currency_original"].str.upper() == "RWF").all()
