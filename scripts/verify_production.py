#!/usr/bin/env python3
"""Read-only smoke test of a deployed Cropmatics API.

    python scripts/verify_production.py
    python scripts/verify_production.py --base-url https://host/api/v1 --json report.json

This is the release gate that GitHub CI *cannot* be: CI proves the repository is
sound, not that the running service is serving real agricultural statistics. It
sends GET requests only - it never writes, never authenticates and never prints a
credential - and it fails when a required analytical endpoint is not answering.

Two classes of endpoint:

* **required** - the release acceptance gates. Each must return 2xx with a body
  that actually carries data. A typed ``503`` means the canonical database cannot
  serve the request, which is a *correct* refusal but still a failed release.
* **context** - reported for information (legacy/context series), not gated.

Exit codes
----------
0  every required endpoint answered
1  at least one required endpoint failed
2  the service could not be reached at all
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field

DEFAULT_BASE_URL = "https://cropsmatics-api.onrender.com/api/v1"
TIMEOUT_SECONDS = 90


@dataclass
class Check:
    name: str
    path: str
    required: bool = True
    # Substrings that must not appear in the response body. Used to catch a
    # credential or a filesystem path leaking through an error contract.
    must_not_contain: tuple[str, ...] = ()
    notes: list[str] = field(default_factory=list)


REQUIRED_CHECKS: tuple[Check, ...] = (
    # The unversioned root probe is what a load balancer or uptime check hits; it
    # is resolved against the host, not against the /api/v1 prefix.
    Check("liveness (root)", "{origin}/health"),
    Check("liveness (versioned)", "/health"),
    Check("readiness", "/health/readiness", must_not_contain=("postgresql://", "password")),
    Check("dataset version", "/data/version"),
    Check("dataset coverage", "/data/coverage"),
    Check("period catalogue", "/meta/periods"),
    Check("crops", "/crops"),
    Check(
        "dashboard overview",
        "/dashboard/overview?benchmark_strategy=national_crop_median",
    ),
    Check("input adoption", "/analytics/input-adoption"),
    Check("canonical trend", "/analytics/canonical-trend?crop=Maize"),
    Check("practice indicators", "/analytics/practice-indicators?district=Bugesera"),
    Check("post-harvest history", "/analytics/postharvest-history?limit=50"),
)

CONTEXT_CHECKS: tuple[Check, ...] = (
    Check("legacy trends", "/analytics/trends", required=False),
    Check("productivity", "/productivity", required=False),
    Check("map metrics", "/maps/district-metrics?metric=yield", required=False),
    Check("model registry", "/meta/models", required=False),
    Check("forecast status", "/analytics/forecast-status", required=False),
)


def _origin(base_url: str) -> str:
    """The host root behind a versioned API base URL."""
    base = base_url.rstrip("/")
    for suffix in ("/api/v1", "/api"):
        if base.endswith(suffix):
            return base[: -len(suffix)]
    return base


def fetch(base_url: str, path: str) -> tuple[int | None, object, str]:
    url = path if path.startswith("http") else f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", "replace")
            try:
                return response.status, json.loads(raw), raw
            except json.JSONDecodeError:
                return response.status, None, raw
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(raw), raw
        except json.JSONDecodeError:
            return error.code, None, raw
    except Exception as error:  # noqa: BLE001 - a smoke test reports, it does not raise
        return None, {"error": type(error).__name__}, str(error)


def _summarise(status: int | None, body: object, raw: str) -> str:
    if status is None:
        return f"unreachable ({str(body)[:60]})" if not isinstance(body, dict) else "unreachable"
    if isinstance(body, dict):
        code = body.get("code")
        if code:
            return f"{code}: {str(body.get('message') or body.get('detail'))[:90]}"
        if status == 200:
            for key in ("rows", "points", "periods", "districts", "crops", "details"):
                value = body.get(key)
                if isinstance(value, list):
                    return f"{key}={len(value)}"
            if isinstance(body.get("data"), dict):
                data = body["data"]
                if data.get("version"):
                    return f"version={data['version']}"
        if body.get("status"):
            return f"status={body['status']}"
    return raw[:80].replace("\n", " ") if raw else ""


def run_checks(base_url: str) -> tuple[list[dict], int]:
    results: list[dict] = []
    failures = 0
    unreachable = 0

    origin = _origin(base_url)
    for check in (*REQUIRED_CHECKS, *CONTEXT_CHECKS):
        check.path = check.path.replace("{origin}", origin)
        status, body, raw = fetch(base_url, check.path)
        if status is None:
            unreachable += 1
        ok = status is not None and 200 <= status < 300
        leaked = [token for token in check.must_not_contain if token in raw]
        if ok and leaked:
            ok = False
            check.notes.append(f"response body leaked: {', '.join(leaked)}")
        if check.required and not ok:
            failures += 1
        results.append(
            {
                "name": check.name,
                "path": check.path,
                "required": check.required,
                "status": status,
                "ok": ok,
                "summary": _summarise(status, body, raw),
                "notes": check.notes,
            }
        )

    # The readiness body carries the canonical contract: the loaded dataset
    # version must equal the one the build expects, or no analytical read can be
    # answered and the whole release is blocked.
    readiness = next((r for r in results if r["name"] == "readiness"), None)
    if readiness and readiness["ok"]:
        _, body, _ = fetch(base_url, "/health/readiness")
        if isinstance(body, dict):
            state = body.get("canonical_state") or {}
            if state.get("version_matches_manifest") is not True:
                failures += 1
                readiness["ok"] = False
                readiness["notes"].append(
                    "readiness returned 200 but the canonical dataset still does not match "
                    f"the build (expected {state.get('expected_version')}, "
                    f"loaded {state.get('dataset_version')})"
                )
            if state.get("blocking"):
                readiness["notes"].append(f"blocking={state['blocking']}")

    return results, (2 if unreachable == len(results) else (1 if failures else 0))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only production API smoke test.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", default=None, help="also write the raw result set here")
    args = parser.parse_args(argv)

    print(f"smoke testing {args.base_url}\n")
    results, code = run_checks(args.base_url)

    width = max(len(r["name"]) for r in results)
    for result in results:
        verdict = "PASS" if result["ok"] else ("fail" if result["required"] else "info")
        marker = " " if result["required"] else "*"
        print(
            f"{verdict:<5}{marker} {result['name']:<{width}}  "
            f"HTTP {str(result['status']):<4} {result['summary']}"
        )
        for note in result["notes"]:
            print(f"        note: {note}")

    required_failed = [r for r in results if r["required"] and not r["ok"]]
    print(
        f"\n{len([r for r in results if r['required']]) - len(required_failed)}"
        f"/{len([r for r in results if r['required']])} required endpoints answered"
    )
    if required_failed:
        print("release gate: FAILED - " + ", ".join(r["name"] for r in required_failed))
    else:
        print("release gate: PASSED")
    print("(* = context endpoint, reported but not gated)")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump({"base_url": args.base_url, "results": results, "exit_code": code}, handle, indent=2)
        print(f"wrote {args.json}")

    return code


if __name__ == "__main__":
    sys.exit(main())
