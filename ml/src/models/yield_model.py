"""Yield prediction models.

Baseline-first: a regularized linear model, then a random forest. Gradient
boosting / XGBoost / LightGBM are deliberately NOT added until they are
justified by out-of-sample gains on season-aware validation.
"""

from __future__ import annotations


def train_linear(X_train, y_train, alpha: float = 1.0):
    from sklearn.linear_model import Ridge

    model = Ridge(alpha=alpha)
    model.fit(X_train, y_train)
    return model


def train_random_forest(X_train, y_train, n_estimators: int = 400, random_state: int = 42):
    from sklearn.ensemble import RandomForestRegressor

    model = RandomForestRegressor(
        n_estimators=n_estimators, random_state=random_state, n_jobs=-1, min_samples_leaf=2
    )
    model.fit(X_train, y_train)
    return model


def predict(model, X) -> list[float]:
    return [float(v) for v in model.predict(X)]


def model_card(name: str, metrics: dict, extra: dict | None = None) -> dict:
    """Minimal model card captured alongside every trained artifact."""
    return {
        "name": name,
        "metrics": metrics,
        "causality_disclaimer": (
            "Model output reflects associations between observed factors and yield; "
            "it does not establish causal effects."
        ),
        "validation": "season-aware holdout where possible",
        **(extra or {}),
    }
