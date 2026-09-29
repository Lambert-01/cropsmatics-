#!/usr/bin/env python3
"""Deprecated alias for :mod:`scripts.data.load_postgres`.

This module used to write ``data/processed/*.csv`` into ``stg_*`` tables with
``pandas.to_sql(if_exists="replace")``. That had three properties that made it
unsuitable as a production persistence layer:

* ``replace`` **drops and recreates** the table on every run, so an interrupted
  load leaves nothing behind and a concurrent reader sees an empty table;
* it creates tables outside Alembic, so the schema drifted from the migrations;
* it records no lineage, so a loaded row could not be traced to a dataset
  version.

``scripts.data.load_postgres`` replaces it: canonical tables, idempotent
``ON CONFLICT`` upserts, a transactional run, and a recorded dataset version.

This file is kept as a shim so existing commands and documentation keep working;
it forwards its arguments and its exit code. Prefer calling the real loader:

    python scripts/data/load_postgres.py --dry-run
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.data.load_postgres import main  # noqa: E402


def run(argv: list[str] | None = None) -> int:
    print(
        "[data] note: load_database.py is now an alias for load_postgres.py "
        "(canonical tables + idempotent upserts).",
        file=sys.stderr,
    )
    return main(argv)


if __name__ == "__main__":
    sys.exit(run())
