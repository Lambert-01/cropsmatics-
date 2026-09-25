"""Data-readiness and data-version endpoint tests."""

from __future__ import annotations

import json


def test_readiness_reports_required_datasets(client):
    res = client.get("/api/v1/health/readiness")
    assert res.status_code == 200
    body = res.json()

    assert body["status"] in {"ready", "degraded"}
    assert body["datasets"], "expected the required dataset list"
    # The two MINAGRI add-on tables are part of the public surface now.
    assert "postharvest_infrastructure" in body["datasets"]
    assert "cold_chain_network_summary" in body["datasets"]
    # Keys match the data manifest so the two can be compared directly.
    assert body["row_counts"]["training"] == 510
    assert body["row_counts"]["national_crop_trends"] == 108
    assert body["dictionaries"] is True


def test_readiness_never_leaks_secrets_or_paths(client):
    raw = json.dumps(client.get("/api/v1/health/readiness").json())

    assert "jwt" not in raw.lower()
    assert "secret" not in raw.lower()
    assert "change-me" not in raw.lower()
    # No filesystem paths: the probe must not help map the server's disk.
    assert "/" not in raw.replace("optional/unavailable", "")
    assert "\\" not in raw


def test_database_is_optional_not_fatal(client):
    body = client.get("/api/v1/health/readiness").json()
    # The analytical endpoints read processed CSVs, so a missing database must
    # degrade gracefully rather than fail readiness.
    assert body["database"] in {"connected", "optional/unavailable"}


def test_data_version_is_safe_projection(client):
    res = client.get("/api/v1/meta/data-version")
    assert res.status_code == 200
    body = res.json()

    assert body["available"] is True
    assert body["pipeline_version"]
    assert body["row_counts"]["training"] == 510
    assert body["validation"]["status"] in {"passed", "failed"}
    assert body["dataset_count"] >= 14

    # Hashes and absolute filesystem paths are deliberately not exposed. The
    # validation messages may reference a relative report name, which is a
    # deliberate pointer for a reviewer rather than a disclosure of the disk layout.
    raw = json.dumps(body)
    assert "sha256" not in raw
    assert "/Users" not in raw
    assert "data/processed" not in raw


def test_data_version_surfaces_the_documented_warnings(client):
    body = client.get("/api/v1/meta/data-version").json()
    issues = body["validation"]["issues"]
    messages = " ".join(i["message"] for i in issues)

    # Warnings are published rather than suppressed.
    assert "blank cultivated_area_ha" in messages
    assert "exceeds cultivated_area_ha" in messages
    assert body["validation"]["warnings"] >= 2
