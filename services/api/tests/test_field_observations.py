"""Privacy and aggregation contract for the plot evidence map endpoint."""

from __future__ import annotations

import pandas as pd


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "period_code": "2024B",
                "district": "Gatsibo",
                "district_code": "RW-02",
                "province": "Eastern",
                "canonical_crop_name": "Maize",
                "crop_raw": "Maize",
                "area_ha": 1.0,
                "production_kg": 2500,
                "geometry_available": False,
                "source_id": "NISR_SAS_MICRODATA_2024B",
                "field_observation_id": "one",
            },
            {
                "period_code": "2024B",
                "district": "Gatsibo",
                "district_code": "RW-02",
                "province": "Eastern",
                "canonical_crop_name": "Maize",
                "crop_raw": "Maize",
                "area_ha": 2.0,
                "production_kg": 3000,
                "geometry_available": False,
                "source_id": "NISR_SAS_MICRODATA_2024B",
                "field_observation_id": "two",
            },
        ]
    )


def test_plot_endpoint_aggregates_and_does_not_expose_plot_ids(client, monkeypatch):
    from app.repositories import dataset_repository as repo

    monkeypatch.setattr(repo, "field_crop_observations", lambda: _frame())
    response = client.get(
        "/api/v1/maps/field-observations",
        params={"period_code": "2024B", "crop": "Maize"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is True
    assert body["n_plot_records"] == 2
    assert body["count"] == 1
    assert body["rows"][0]["n_plots"] == 2
    assert body["rows"][0]["area_ha"] == 3
    assert body["rows"][0]["production_kg"] == 5500
    assert body["rows"][0]["yield_kg_ha"] == 5500 / 3
    assert body["district_summaries"] == [
        {
            "district": "Gatsibo",
            "district_code": "RW-02",
            "province": "Eastern",
            "crop_count": 1,
            "plot_crop_records": 2,
            "area_ha": 3.0,
            "production_kg": 5500.0,
        }
    ]
    assert "field_observation_id" not in body["rows"][0]
    assert body["geometry_available"] is False


def test_plot_endpoint_reports_unavailable_when_no_microdata_is_loaded(client, monkeypatch):
    from app.repositories import dataset_repository as repo

    monkeypatch.setattr(repo, "field_crop_observations", lambda: pd.DataFrame())
    response = client.get("/api/v1/maps/field-observations")

    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["rows"] == []
    assert "microdata" in body["message"].lower()


def test_plot_endpoint_preserves_counts_from_public_aggregate(client, monkeypatch):
    from app.repositories import dataset_repository as repo

    aggregate = pd.DataFrame(
        [
            {
                "period_code": "2024B",
                "district": "Gatsibo",
                "district_code": "RW-EA-GAT",
                "province": "Eastern",
                "canonical_crop_name": "Maize",
                "area_ha": 32.5,
                "production_kg": 53_750,
                "geometry_available": False,
                "source_id": "NISR_AHS_MICRODATA_2024",
                "record_scope": "aggregated_plot_crop",
                "n_plot_records": 226,
                "n_plots": 226,
            }
        ]
    )
    monkeypatch.setattr(repo, "field_crop_observations", lambda: aggregate)

    response = client.get(
        "/api/v1/maps/field-observations",
        params={"period_code": "2024B", "district": "Gatsibo", "crop": "Maize"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is True
    assert body["n_plot_records"] == 226
    assert body["area_ha_total"] == 32.5
    assert body["production_kg_total"] == 53750
    assert body["yield_kg_ha_total"] == 53750 / 32.5
    assert body["available_periods"] == ["2024B"]
    assert body["rows"][0]["n_plots"] == 226
    assert body["district_summaries"][0]["crop_count"] == 1
    assert body["district_summaries"][0]["plot_crop_records"] == 226
