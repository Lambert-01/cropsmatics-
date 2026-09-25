#!/usr/bin/env python3
"""Build the web map's Rwanda district GeoJSON from a legitimate source.

Source: geoBoundaries (open, CC-BY 4.0) RWA ADM2 — the 30 official districts.
The download is simplified with a pure-Python Ramer–Douglas–Peucker pass and
coordinate rounding so the file ships comfortably to the browser. District names
are joined to the canonical ``district_code`` + province from
``data/dictionaries/districts.csv`` so the map joins on the same identifier as
the API and CSVs.

This script needs network access, so it is intentionally NOT part of
``run_all.py`` (which must stay offline and deterministic). The generated file is
committed under ``apps/web/public/geodata/``.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

from scripts.data.common import DICTS_DIR, ROOT, log

SOURCE_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/"
    "gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2.geojson"
)
OUT = ROOT / "apps" / "web" / "public" / "geodata" / "rwanda_districts.geojson"
TOLERANCE = 0.004  # degrees (~450 m): keeps district shapes recognisable
PRECISION = 4


def _rdp(points: list[list[float]], eps: float) -> list[list[float]]:
    """Ramer–Douglas–Peucker line simplification."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5
    idx, max_dist = 0, 0.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if norm == 0:
            dist = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
        else:
            dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if dist > max_dist:
            idx, max_dist = i, dist
    if max_dist > eps:
        left = _rdp(points[: idx + 1], eps)
        right = _rdp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]


def _simplify_ring(ring: list[list[float]]) -> list[list[float]]:
    simplified = _rdp(ring, TOLERANCE)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return [[round(p[0], PRECISION), round(p[1], PRECISION)] for p in simplified]


def _simplify_geometry(geom: dict) -> dict:
    if geom["type"] == "Polygon":
        coords = [_simplify_ring(ring) for ring in geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        coords = [
            [_simplify_ring(ring) for ring in polygon]
            for polygon in geom["coordinates"]
        ]
    else:
        raise ValueError(f"unexpected geometry type: {geom['type']}")
    return {"type": geom["type"], "coordinates": coords}


def _load_source(local_path: str | None) -> dict:
    """Load the source GeoJSON from a local file, else download it."""
    if local_path:
        return json.loads(Path(local_path).read_text())
    with urllib.request.urlopen(SOURCE_URL) as resp:  # noqa: S310 - fixed trusted URL
        return json.load(resp)


def main() -> int:
    import pandas as pd

    local = sys.argv[1] if len(sys.argv) > 1 else None
    source = _load_source(local)

    districts = pd.read_csv(DICTS_DIR / "districts.csv")
    meta = {row["district"]: row for _, row in districts.iterrows()}

    features = []
    unmatched = []
    for feat in source["features"]:
        name = feat["properties"].get("shapeName")
        row = meta.get(name)
        if row is None:
            unmatched.append(name)
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "district": name,
                "district_code": row["district_code"],
                "province": row["province"],
                "agro_ecological_zone": row["agro_ecological_zone"],
            },
            "geometry": _simplify_geometry(feat["geometry"]),
        })

    if unmatched:
        log(f"WARNING: districts without a dictionary match: {unmatched}")
    if len(features) != 30:
        log(f"ERROR: expected 30 districts, got {len(features)}")
        return 1

    collection = {
        "type": "FeatureCollection",
        "source": "geoBoundaries RWA ADM2 (open, CC-BY 4.0)",
        "source_url": SOURCE_URL,
        "properties": {
            "layer": "rwanda_districts",
            "simplification_tolerance_deg": TOLERANCE,
        },
        "features": features,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(collection, separators=(",", ":")))
    size_kb = OUT.stat().st_size / 1024
    log(f"built {OUT.relative_to(ROOT)}: {len(features)} districts, {size_kb:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
