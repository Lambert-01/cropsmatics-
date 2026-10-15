"""Packaging declarations required by the remote provider and forecast service."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_httpx_is_a_runtime_dependency_not_only_a_test_dependency():
    requirements = (ROOT / "services/api/requirements.txt").read_text().splitlines()
    assert "httpx==0.27.2" in requirements


def test_container_build_generates_the_forecast_report_after_copying_ml():
    dockerfile = (ROOT / "services/api/Dockerfile").read_text()
    assert dockerfile.index("COPY ml /app/ml") < dockerfile.index(
        "RUN python -m ml.src.pipelines.run_forecast_backtest"
    )
    # The report must not accidentally depend on opting into heavy training extras.
    assert dockerfile.index("RUN python -m ml.src.pipelines.run_forecast_backtest") < dockerfile.index(
        "ARG INSTALL_ML=false"
    )
