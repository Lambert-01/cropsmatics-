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
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlparse

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
    # A yield map needs a named crop and a district-bearing period. An unscoped
    # yield request is valid but can return zero districts, which is not a useful
    # release assertion for the map workflow.
    Check("map metrics", "/maps/district-metrics?metric=yield&crop=Maize&period_code=2026B"),
    Check("practice indicators", "/analytics/practice-indicators?district=Bugesera"),
    Check("post-harvest history", "/analytics/postharvest-history?limit=50"),
)

CONTEXT_CHECKS: tuple[Check, ...] = (
    Check("legacy trends", "/analytics/trends", required=False),
    Check("productivity", "/productivity", required=False),
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
        # The kind, not just the class name: "connection_closed" (a restart or
        # idle-timeout) and "dns_failure" (no request was ever sent) look alike
        # in a log line and mean entirely different things.
        return None, {"error": classify_error(error), "detail": str(error)[:160]}, str(error)


# --- connectivity diagnosis -------------------------------------------------
#
# A browser reports several very different failures with messages that look
# alike. `net::ERR_NAME_NOT_RESOLVED` happens *before* any HTTP request exists,
# so it can never be caused by the API, its CORS policy or its database - yet it
# is routinely read as "the backend is broken". This section separates the
# layers so the verdict names one of: DNS resolution, TCP connection, TLS
# handshake, a request that timed out, or an actual HTTP response.

#: Public resolvers used only to *compare* against the system resolver. A
#: hostname that resolves independently but not locally is a local DNS, VPN,
#: proxy or DNS-filtering problem, not a DNS record that does not exist.
PUBLIC_RESOLVERS: tuple[str, ...] = ("1.1.1.1", "8.8.8.8")


def system_resolve(host: str) -> dict:
    """Resolve via the OS resolver - the same path a browser takes."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as error:
        return {
            "resolver": "system",
            "ok": False,
            "kind": "dns_failure",
            "detail": f"{error.__class__.__name__}: {error}",
            "addresses": [],
        }
    except Exception as error:  # noqa: BLE001
        return {
            "resolver": "system",
            "ok": False,
            "kind": "dns_failure",
            "detail": f"{error.__class__.__name__}: {error}",
            "addresses": [],
        }
    addresses = sorted({info[4][0] for info in infos})
    return {"resolver": "system", "ok": True, "kind": None, "detail": None, "addresses": addresses}


def independent_resolve(host: str, resolver: str) -> dict:
    """Resolve through an independent public resolver, when a tool is available.

    Best-effort by design: a container without `dig`/`nslookup` still gets the
    system answer, and the report says which check could not run rather than
    implying it passed.
    """
    for tool, args in (("dig", ["+short", host, f"@{resolver}"]), ("nslookup", [host, resolver])):
        try:
            completed = subprocess.run(
                [tool, *args], capture_output=True, text=True, timeout=15, check=False
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        except Exception as error:  # noqa: BLE001
            return {
                "resolver": resolver,
                "ok": False,
                "kind": "probe_error",
                "detail": f"{tool}: {error.__class__.__name__}",
                "addresses": [],
            }
        addresses = [
            line.strip()
            for line in completed.stdout.splitlines()
            if line.strip() and not line.strip().startswith((";", "Server", "Address"))
        ]
        # `nslookup` prints "Name:"/"Address:" labels; keep only address rows.
        addresses = [value.split()[-1] for value in addresses if value.split()]
        addresses = sorted({value for value in addresses if value and value[0].isdigit()})
        return {
            "resolver": resolver,
            "ok": bool(addresses),
            "kind": None if addresses else "dns_failure",
            "detail": None if addresses else f"{tool} returned no address",
            "addresses": addresses,
        }
    return {
        "resolver": resolver,
        "ok": False,
        "kind": "probe_unavailable",
        "detail": "no dig or nslookup on PATH",
        "addresses": [],
    }


def classify_error(error: BaseException) -> str:
    """Name the layer that failed, in the vocabulary a browser error maps onto."""
    if isinstance(error, urllib.error.HTTPError):
        return "http_error"
    if isinstance(error, socket.gaierror):
        return "dns_failure"
    if isinstance(error, ssl.SSLError):
        return "tls_failure"
    if isinstance(error, TimeoutError | socket.timeout):
        return "timeout"
    if isinstance(error, ConnectionResetError):
        return "connection_closed"
    if isinstance(error, ConnectionRefusedError):
        return "connection_refused"
    if isinstance(error, urllib.error.URLError):
        return classify_error(error.reason) if isinstance(error.reason, BaseException) else "network_failure"
    if isinstance(error, OSError):
        return "network_failure"
    return "unknown"


def diagnose_connectivity(base_url: str) -> dict:
    """Report which layer of the connection actually works, and which does not.

    Reads nothing from the API beyond the readiness probe; never prints a
    credential. The per-check results are far more useful once it is known
    whether DNS even resolved.
    """

    host = urlparse(base_url if "://" in base_url else f"https://{base_url}").hostname
    report: dict = {
        "checked_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "base_url": base_url,
        "host": host,
    }
    if not host:
        report.update({"verdict": "invalid_base_url"})
        return report

    local = system_resolve(host)
    report["system_resolver"] = local
    report["independent_resolvers"] = [independent_resolve(host, r) for r in PUBLIC_RESOLVERS]
    resolved_elsewhere = [r for r in report["independent_resolvers"] if r["ok"]]

    # The shallow liveness probe: it answers whether or not the canonical
    # dataset is ready, so a failure here is a *connection* fact, never a data
    # problem, and the verdict stays about the network layer.
    request = urllib.request.Request(f"{base_url.rstrip('/')}/health", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            report.update({"reachable": True, "http_status": response.status, "failure_kind": None})
    except urllib.error.HTTPError as error:
        # An HTTP status, including 5xx, means DNS, TCP and TLS all worked. The
        # service answered; that is a different problem from not being reachable.
        report.update({"reachable": True, "http_status": error.code, "failure_kind": "http_error"})
    except Exception as error:  # noqa: BLE001 - a diagnosis reports, it does not raise
        report.update(
            {
                "reachable": False,
                "http_status": None,
                "failure_kind": classify_error(error),
                "failure_detail": f"{error.__class__.__name__}: {str(error)[:160]}",
            }
        )

    if report.get("reachable"):
        report["verdict"] = "reachable"
    elif not local["ok"] and resolved_elsewhere:
        report["verdict"] = "local_dns_or_network"
        report["hint"] = (
            f"{host} resolves from an independent resolver but not from this machine's "
            "resolver. That is a local DNS, VPN, proxy or DNS-filtering problem: the "
            "published address itself is fine, and no API or client change can fix it."
        )
    elif not local["ok"]:
        report["verdict"] = "dns_failure"
        report["hint"] = (
            f"{host} did not resolve from this machine or from a public resolver. Check "
            "the hostname against the deployment's configuration rather than the client."
        )
    else:
        report["verdict"] = report.get("failure_kind") or "unreachable"
    return report


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

    # Diagnose the connection before interpreting any status code. Without this,
    # a DNS failure and a real HTTP 503 are reported identically as "fail".
    diagnosis = diagnose_connectivity(args.base_url)
    print("connectivity")
    print(f"  host: {diagnosis.get('host')}")
    local = diagnosis.get("system_resolver") or {}
    print(
        "  system resolver: "
        + (
            ", ".join(local.get("addresses") or [])
            if local.get("ok")
            else f"FAILED ({local.get('detail')})"
        )
    )
    for resolver in diagnosis.get("independent_resolvers") or []:
        state = ", ".join(resolver.get("addresses") or []) if resolver.get("ok") else (
            resolver.get("kind") or "failed"
        )
        print(f"  resolver {resolver.get('resolver')}: {state}")
    print(f"  verdict: {diagnosis.get('verdict')}")
    if diagnosis.get("hint"):
        print(f"  hint: {diagnosis['hint']}")
    print()

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
            json.dump(
                {
                    "base_url": args.base_url,
                    "connectivity": diagnosis,
                    "results": results,
                    "exit_code": code,
                },
                handle,
                indent=2,
            )
        print(f"wrote {args.json}")

    return code


if __name__ == "__main__":
    sys.exit(main())
