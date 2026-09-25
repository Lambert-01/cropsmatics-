#!/usr/bin/env python3
"""Run the full data pipeline in deterministic order.

    validate_raw -> normalize_geography -> normalize_crops
                 -> build_district_crop -> build_factor -> build_irrigation
                 -> build_erosion -> build_postharvest -> build_national_trends
                 -> build_input_trends -> build_cold_chain -> build_training
                 -> build_dashboard_summary -> build_data_coverage -> build_sources

Stops immediately if validation fails. Safe to re-run; outputs are overwritten.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

STEPS = [
    "scripts.data.validate_raw",
    "scripts.data.normalize_geography",
    "scripts.data.normalize_crops",
    "scripts.data.build_district_crop_dataset",
    "scripts.data.build_factor_dataset",
    "scripts.data.build_irrigation",
    "scripts.data.build_erosion",
    "scripts.data.build_postharvest_dataset",
    "scripts.data.build_national_trends",
    "scripts.data.build_input_trends",
    "scripts.data.build_cold_chain",
    "scripts.data.build_training_dataset",
    "scripts.data.build_dashboard_summary",
    "scripts.data.build_data_coverage",
    "scripts.data.build_sources",
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
