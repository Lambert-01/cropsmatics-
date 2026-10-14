"""Safety properties of the read-only diagnostics and the bootstrap plan output.

The diagnostics exist so a production target can be inspected without writing
to it and without leaking its connection string. These tests pin that contract
without needing a live database.
"""

from __future__ import annotations

from scripts.data.canonical_bootstrap import _target_identity
from scripts.data.production_diagnostics import resolve_url, target_identity
from scripts.data.rehearse_release import refuse_production_target

# --- credential hygiene ------------------------------------------------------

def test_target_identity_never_contains_the_password():
    """The plan and diagnostics may name the host, never the secret."""
    url = "postgresql+psycopg://cropmatics:s3cret-pass@ep-abc-pooler.eu-central-1.aws.neon.tech:5432/cropmatics"
    shown = _target_identity(url)
    assert "s3cret-pass" not in shown
    assert "ep-abc-pooler.eu-central-1.aws.neon.tech" in shown
    assert "cropmatics" in shown


def test_production_diagnostics_identity_redacts_credentials():
    url = "postgresql+psycopg://role:password@db.example.com:5432/name?sslmode=require"
    identity = target_identity(url)
    assert identity["host"] == "db.example.com"
    assert identity["database"] == "name"
    assert identity["role"] == "role"
    assert identity["tls"] == "require"
    assert "password" not in str(identity)


# --- connection-string precedence -------------------------------------------

def test_resolve_url_prefers_the_flag(monkeypatch):
    monkeypatch.setenv("PRODUCTION_DATABASE_URL", "postgresql+psycopg://p:1@prod/db")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://d:2@local/db")
    assert resolve_url("postgresql+psycopg://f:3@flag/db") == "postgresql+psycopg://f:3@flag/db"


def test_resolve_url_prefers_production_over_database_url(monkeypatch):
    monkeypatch.setenv("PRODUCTION_DATABASE_URL", "postgresql+psycopg://p:1@prod/db")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://d:2@local/db")
    assert resolve_url(None) == "postgresql+psycopg://p:1@prod/db"


def test_resolve_url_falls_back_to_database_url(monkeypatch):
    monkeypatch.delenv("PRODUCTION_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://d:2@local/db")
    assert resolve_url(None) == "postgresql+psycopg://d:2@local/db"


def test_resolve_url_is_none_when_nothing_is_set(monkeypatch):
    monkeypatch.delenv("PRODUCTION_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert resolve_url(None) is None


# --- dry-run plan output -----------------------------------------------------

def test_the_dry_run_plan_names_the_target_without_its_password(monkeypatch, processed_dir, capsys):
    """The plan must be reviewable and archivable: host yes, password no."""
    from scripts.data import canonical_bootstrap, load_postgres

    monkeypatch.setattr(canonical_bootstrap, "_migration_state", lambda url: (None, "head"))
    monkeypatch.setattr(canonical_bootstrap, "_current_version", lambda url: "0.2.0-stale00000000")
    monkeypatch.setattr(canonical_bootstrap, "_loaded_summary", lambda url: {"rows": 1, "periods": ["2024A"]})
    monkeypatch.setattr(canonical_bootstrap, "_verify", lambda url, expected: True)
    monkeypatch.setattr(load_postgres, "main", lambda argv: 0)

    url = "postgresql+psycopg://role:hunter2@ep-real.eu-central-1.aws.neon.tech:5432/cropmatics"
    code = canonical_bootstrap.main(["--dry-run", "--url", url])
    out = capsys.readouterr().out

    assert code == 0
    assert "hunter2" not in out
    assert "ep-real.eu-central-1.aws.neon.tech" in out
    assert "dry run plan:" in out
    assert "6156" in out  # the expected productivity rows appear in the plan


# --- rehearsal refuses production -------------------------------------------

def test_the_rehearsal_refuses_the_production_host_and_database(monkeypatch):
    monkeypatch.setenv(
        "PRODUCTION_DATABASE_URL",
        "postgresql+psycopg://r:pw@ep-prod.eu-central-1.aws.neon.tech:5432/cropmatics",
    )
    same = "postgresql+psycopg://r:pw@ep-prod.eu-central-1.aws.neon.tech:5432/cropmatics"
    assert refuse_production_target(same) is True


def test_the_rehearsal_allows_an_isolated_branch_on_the_same_host(monkeypatch):
    monkeypatch.setenv(
        "PRODUCTION_DATABASE_URL",
        "postgresql+psycopg://r:pw@ep-prod.eu-central-1.aws.neon.tech:5432/cropmatics",
    )
    branch = "postgresql+psycopg://r:pw@ep-prod.eu-central-1.aws.neon.tech:5432/cropmatics_rehearsal"
    assert refuse_production_target(branch) is False
