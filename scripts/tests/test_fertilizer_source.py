"""Contracts for fertilizer source ingestion and exposure."""

from __future__ import annotations

import pandas as pd

from scripts.data.build_fertilizer_source import build
from scripts.data.common import PROCESSED_FILES
from scripts.tests.conftest import require


def test_fertilizer_source_output_has_all_published_periods(processed_dir):
    frame = pd.read_csv(require(processed_dir / PROCESSED_FILES["fertilizer_source"]))
    assert sorted(frame["period_code"].unique()) == [
        "2022A", "2022B", "2022C",
        "2023A", "2023B", "2023C",
        "2024A", "2024B", "2024C",
        "2025A", "2025B", "2025C",
        "2026A", "2026B",
    ]
    assert set(frame["source_channel"].dropna()) == {
        "government",
        "agro_dealers",
        "ngos_companies",
        "market",
        "agriculture_cooperative",
        "other",
    }
    assert frame["source_id"].notna().all()
    assert frame["source_sheet"].notna().all()
    assert frame["source_row"].notna().all()


def test_fertilizer_source_preserves_blanks_and_totals():
    source = pd.DataFrame(
        {
            "period_code": ["2025B"],
            "share_pct": [None],
            "reported_total_pct": [100],
            "source_sum_pct": [64.2],
            "source_row": [4],
            "fertilizer_name": ["Example"],
            "source_channel": ["government"],
        }
    )
    out, stats = build(source)
    assert pd.isna(out.loc[0, "share_pct"])
    assert out.loc[0, "reported_total_pct"] == 100
    assert stats["rows"] == 1
