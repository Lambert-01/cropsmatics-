"""Explainability helpers.

SHAP and permutation importance describe what a model learned. They are **not**
causal inference. Any UI built on these must say "associated factors".
"""

from __future__ import annotations


def native_importance(model, feature_names: list[str]) -> list[dict]:
    """Impurity-based importance for tree models (fallback: absolute coefficients)."""
    if hasattr(model, "feature_importances_"):
        values = list(model.feature_importances_)
    elif hasattr(model, "coef_"):
        values = [abs(float(c)) for c in model.coef_]
    else:
        return []
    total = sum(values) or 1.0
    ranked = sorted(zip(feature_names, values, strict=True), key=lambda kv: kv[1], reverse=True)
    return [{"feature": f, "importance": round(v / total, 5)} for f, v in ranked]


def permutation_importance(model, X, y, feature_names: list[str], n_repeats: int = 5,
                           random_state: int = 42) -> list[dict]:
    """Model-agnostic permutation importance."""
    from sklearn.inspection import permutation_importance as sk_permutation_importance

    result = sk_permutation_importance(
        model, X, y, n_repeats=n_repeats, random_state=random_state, n_jobs=-1
    )
    ranked = sorted(
        zip(feature_names, result.importances_mean, strict=True), key=lambda kv: kv[1], reverse=True
    )
    return [{"feature": f, "importance": float(v)} for f, v in ranked]


def shap_summary(model, X, max_rows: int = 200) -> list[dict]:
    """Mean absolute SHAP value per feature (requires ``shap`` installed)."""
    import shap

    sample = X.iloc[:max_rows] if hasattr(X, "iloc") else X[:max_rows]
    explainer = shap.Explainer(model, sample)
    values = explainer(sample).values
    names = list(X.columns) if hasattr(X, "columns") else [f"f{i}" for i in range(values.shape[1])]
    mean_abs = abs(values).mean(axis=0)
    ranked = sorted(zip(names, mean_abs, strict=True), key=lambda kv: kv[1], reverse=True)
    return [{"feature": n, "mean_abs_shap": float(v)} for n, v in ranked]
