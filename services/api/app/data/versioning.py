"""Content-addressed dataset identity.

The dataset version answers one question: *is this the same data?* It is derived
**only from content** — the pipeline/transformation version, the SHA-256 of every
canonical processed output, the SHA-256 of every raw/SAS input, and the row
counts. Identical inputs and outputs always hash to the same version, and any
change to the data changes it.

Deliberately excluded:

* ``build_timestamp`` — it changes on every rebuild of identical data, so a
  version that included it would answer "is this the same clock?", not "is this
  the same data?". That is what made a pre-deploy bootstrap re-load thousands of
  unchanged rows on every deploy.
* ``git_sha`` — a commit is code identity, not data identity, and it changes for
  reasons that have nothing to do with the published figures.

This module lives with the application (not the pipeline scripts) so the loader
and the API's readiness probe compute the *same* expected version from the same
manifest, with no import of ``scripts.*`` required.
"""

from __future__ import annotations

import hashlib
import json


def content_version(manifest: dict) -> str:
    """``"0.2.0-<16 hex>"`` — stable for identical content, different otherwise."""
    outputs = manifest.get("outputs") or {}
    sources = manifest.get("sources") or {}
    sas_inputs = manifest.get("sas_inputs") or {}
    payload = json.dumps(
        {
            "pipeline_version": manifest.get("pipeline_version"),
            "outputs": {
                str(key): (value or {}).get("sha256")
                for key, value in sorted(outputs.items())
            },
            "sources": {
                str(key): (value or {}).get("sha256")
                for key, value in sorted(sources.items())
            },
            "sas_inputs": {
                str(key): (value or {}).get("sha256")
                for key, value in sorted(sas_inputs.items())
            },
            "row_counts": manifest.get("row_counts") or {},
        },
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    pipeline = manifest.get("pipeline_version") or "0.0.0"
    return f"{pipeline}-{digest}"
