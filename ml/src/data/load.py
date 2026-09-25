"""Load processed analytical tables for modelling."""

from __future__ import annotations

from pathlib import Path

from ml.src.utils.paths import TRAINING_TABLE


def load_training_dataframe(path: Path | None = None):
    """Return the primary analytical table as a pandas DataFrame."""
    import pandas as pd

    target = path or TRAINING_TABLE
    if not target.exists():
        raise FileNotFoundError(
            f"{target} not found. Run `make data` to build processed tables first."
        )
    return pd.read_csv(target)


def load_training_records(path: Path | None = None) -> list[dict]:
    """Return the analytical table as plain dict records (no pandas needed downstream)."""
    import pandas as pd

    target = path or TRAINING_TABLE
    if not target.exists():
        raise FileNotFoundError(f"{target} not found. Run `make data` first.")
    df = pd.read_csv(target)
    return df.where(pd.notna(df), None).to_dict(orient="records")
