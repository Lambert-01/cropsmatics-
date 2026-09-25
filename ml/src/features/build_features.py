"""Feature engineering for the yield model.

Predictors are the observed input/practice adoption rates plus crop, geography
and season. These are **associated factors**, not causal variables — the model
description and API responses must say so.
"""

from __future__ import annotations

import pandas as pd

TARGET = "yield_kg_ha"

NUMERIC_FEATURES = [
    "improved_seed_farmers_pct",
    "organic_fertilizer_farmers_pct",
    "inorganic_fertilizer_farmers_pct",
    "pesticide_farmers_pct",
    "erosion_protection_farmers_pct",
    "mechanization_farmers_pct",
    "irrigation_farmers_pct",
    "agroforestry_farmers_pct",
    "agricultural_land_000ha",
]

CATEGORICAL_FEATURES = ["canonical_crop_name", "province", "season"]


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Keep rows with a usable yield; do not impute the target."""
    return df[df[TARGET].fillna(0) > 0].copy()


def build_design_matrix(df: pd.DataFrame):
    """Return (X, y, feature_names) with one-hot encoded categoricals."""
    df = clean(df)
    present_num = [c for c in NUMERIC_FEATURES if c in df.columns]
    present_cat = [c for c in CATEGORICAL_FEATURES if c in df.columns]

    X = df[present_num].copy()
    for col in present_num:
        X[col] = pd.to_numeric(X[col], errors="coerce")
    X[present_cat] = df[present_cat].astype(str)
    X = pd.get_dummies(X, columns=present_cat, dummy_na=False)
    X = X.astype(float)

    y = pd.to_numeric(df[TARGET], errors="coerce")
    mask = y.notna()
    return X[mask], y[mask], list(X.columns)
