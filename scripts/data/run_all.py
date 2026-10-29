#!/usr/bin/env python3
"""Run the full data pipeline in deterministic order.

    catalog_raw -> ingest_sas_tables -> build_crop_productivity
                -> ingest_market_prices -> validate_raw
                -> normalize_geography -> normalize_crops
                -> build_district_crop -> build_factor -> build_irrigation
                -> build_erosion -> build_postharvest
                -> build_practice_observation -> build_postharvest_multi
                -> build_national_trends
                -> build_input_trends -> build_cold_chain
                -> build_postharvest_infrastructure -> build_cold_chain_network_summary
                -> build_training
                -> build_dashboard_summary -> build_data_coverage -> build_sources
                -> build_manifest

The multi-season SAS chain runs first because it has its own hard contracts
(the table mapping must be unique and complete, every district/crop must resolve
against the dictionaries) and because ``validate_raw`` checks the freshly built
panel in the same run. Nothing downstream of validation is written when
validation fails: the run stops with a non-zero exit code.

Safe to re-run; outputs are overwritten deterministically.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

STEPS = [
    "scripts.data.catalog_raw",
    "scripts.data.ingest_sas_tables",
    "scripts.data.build_fertilizer_source",
    "scripts.data.build_crop_productivity",
    "scripts.data.ingest_market_prices",
    "scripts.data.validate_raw",
    "scripts.data.normalize_geography",
    "scripts.data.normalize_crops",
    "scripts.data.extract_plot_observations",
    "scripts.data.build_district_crop_dataset",
    "scripts.data.build_factor_dataset",
    "scripts.data.build_irrigation",
    "scripts.data.build_erosion",
    "scripts.data.build_postharvest_dataset",
    "scripts.data.build_agricultural_practice_observation",
    "scripts.data.build_crop_postharvest_multi_period",
    "scripts.data.build_national_trends",
    "scripts.data.build_input_trends",
    "scripts.data.build_cold_chain",
    "scripts.data.build_postharvest_infrastructure",
    "scripts.data.build_cold_chain_network_summary",
    "scripts.data.build_training_dataset",
    "scripts.data.build_dashboard_summary",
    "scripts.data.build_data_coverage",
    "scripts.data.build_sources",
    "scripts.data.build_manifest",
]


def run(module: str) -> int:
    print(f"\n=== {module} ===")
    return subprocess.call([sys.executable, "-m", module], cwd=ROOT)


def main() -> int:
    for module in STEPS:
        code = run(module)
        if code != 0:
            print(f"\nPipeline stopped: {module} exited {code}")
            return code
    print("\nPipeline complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
