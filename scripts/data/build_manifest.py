#!/usr/bin/env python3
"""Write the processed-data manifest (``data/processed/manifest.json``).

The manifest is the auditable record of a pipeline run: which sources went in
(hashes), what came out (hashes + row counts), which code produced it (pipeline
version + git SHA) and which data-quality issues were flagged.

It is exposed - safely, without hashes or filesystem paths - by
``GET /api/v1/meta/data-version`` and summarised on the transparency page.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import UTC, datetime

from scripts.data.common import (
    INTERIM_DIR,
    PIPELINE_VERSION,
    PROCESSED_DIR,
    PROCESSED_FILES,
    RAW_EXTERNAL_FILES,
    RAW_FILES,
    RAW_MINAGRI,
    RAW_PACK,
    log,
)


def _sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=PROCESSED_DIR.parents[1], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:  # git absent, not a repo, or shallow export
        return "unknown"


def _row_count(path) -> int:
    # Cheap line count; the pipeline writes header + one line per row.
    with open(path, "rb") as fh:
        return max(sum(1 for _ in fh) - 1, 0)


def main() -> int:
    sources: dict[str, dict] = {}
    for key, filename in RAW_FILES.items():
        path = RAW_PACK / filename
        if path.exists():
            sources[key] = {"file": filename, "sha256": _sha256(path)}
    for key, filename in RAW_EXTERNAL_FILES.items():
        path = RAW_MINAGRI / filename
        if path.exists():
            sources[key] = {"file": filename, "sha256": _sha256(path), "origin": "minagri-addon"}

    outputs: dict[str, dict] = {}
    for key, filename in PROCESSED_FILES.items():
        path = PROCESSED_DIR / filename
        if path.exists():
            outputs[key] = {
                "file": filename,
                "sha256": _sha256(path),
                "rows": _row_count(path),
            }

    report_path = INTERIM_DIR / "validation_report.json"
    validation = json.loads(report_path.read_text()) if report_path.exists() else {}

    manifest = {
        "pipeline_version": PIPELINE_VERSION,
        "git_sha": _git_sha(),
        "build_timestamp": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources": sources,
        "outputs": outputs,
        "row_counts": {k: v["rows"] for k, v in outputs.items()},
        "validation": {
            "status": validation.get("status", "unknown"),
            "errors": validation.get("errors", 0),
            "warnings": validation.get("warnings", 0),
            "issues": validation.get("issues", []),
        },
    }

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2))
    log(
        f"built manifest.json: {len(sources)} source hashes, {len(outputs)} outputs, "
        f"validation={manifest['validation']['status']} "
        f"(errors={manifest['validation']['errors']}, warnings={manifest['validation']['warnings']})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
