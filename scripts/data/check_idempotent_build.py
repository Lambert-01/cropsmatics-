#!/usr/bin/env python3
"""Prove that rebuilding the pipeline does not change the dataset identity.

    python scripts/data/check_idempotent_build.py

The canonical load is skipped when the database already carries the dataset this
build produced, and the API *rejects* a database whose dataset version differs
from its own. That contract is only safe if the same commit always builds the
same dataset: a build that depends on what a previous build left in the working
tree can produce a second, different version, and then no load can ever match it
(the exact trap that made a stale production database unfixable by re-running the
release step).

This runs the pipeline twice in place and compares the content-addressed version
before and after. Exit code 0 means the identity is stable; 1 means the build is
environment-dependent and must be fixed.

Read-only with respect to the database: it never connects to one.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for candidate in (ROOT, ROOT / "services" / "api"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from app.data.versioning import content_version  # noqa: E402

MANIFEST = ROOT / "data" / "processed" / "manifest.json"


def current_version() -> str:
    return content_version(json.loads(MANIFEST.read_text()))


def main() -> int:
    if not MANIFEST.exists():
        print("ERROR: data/processed/manifest.json is missing. Run the pipeline first.")
        return 1

    before = current_version()
    print(f"dataset version before the rebuild: {before}")

    code = subprocess.call([sys.executable, "scripts/data/run_all.py"], cwd=ROOT)
    if code != 0:
        print(f"ERROR: the second pipeline run exited {code}.")
        return 1

    after = current_version()
    print(f"dataset version after the rebuild:  {after}")

    if before != after:
        print(
            "ERROR: rebuilding changed the dataset identity, so the build depends on\n"
            "       leftover state in the working tree. A deploy could load one\n"
            "       version while the image expects another."
        )
        return 1

    print("verified: the pipeline is idempotent - the dataset identity is unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
