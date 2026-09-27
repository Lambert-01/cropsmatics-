"""URL-safe entity identifiers shared by the API and the mobile client.

Raw names must never appear in a route (``/explore/crop/Irish Potato`` breaks on
spaces and casing). Instead every crop and district is addressed by a stable
``crop_code`` (``CROP-POT``) or ``district_code`` (``RW-NO-RUL``), and the mobile
client can additionally pass a slugified name (``irish-potato``) which resolves
to the same entity.

The :func:`slugify_entity` implementation here mirrors the TypeScript helper in
``apps/mobile/src/utils/slug.ts`` so the two sides agree byte-for-byte.
"""

from __future__ import annotations

import re

from app.repositories import dataset_repository as repo


def slugify_entity(value: str | None) -> str:
    """Lower-case, ASCII-ish, hyphenated slug. Empty input -> empty string."""
    if not value:
        return ""
    normalized = value.strip().lower()
    # Replace any run of non-alphanumeric characters with a single hyphen.
    slug = re.sub(r"[^a-z0-9]+", "-", normalized)
    return slug.strip("-")


def _crop_rows():
    return repo.crops()


def _district_rows():
    return repo.districts()


def resolve_crop_slug(slug: str) -> dict | None:
    """Resolve a ``crop_code`` or a slugified crop name to its dictionary row."""
    if not slug:
        return None
    target = slug.strip()
    df = _crop_rows()
    for _, row in df.iterrows():
        if str(row["crop_code"]).lower() == target.lower():
            return dict(row)
    wanted = slugify_entity(target)
    for _, row in df.iterrows():
        if slugify_entity(str(row["crop_name"])) == wanted:
            return dict(row)
    if "kinyarwanda_name" in df.columns:
        for _, row in df.iterrows():
            if slugify_entity(str(row.get("kinyarwanda_name"))) == wanted:
                return dict(row)
    return None


def resolve_district_slug(slug: str) -> dict | None:
    """Resolve a ``district_code`` or a slugified district name."""
    if not slug:
        return None
    target = slug.strip()
    df = _district_rows()
    for _, row in df.iterrows():
        if str(row["district_code"]).lower() == target.lower():
            return dict(row)
    wanted = slugify_entity(target)
    for _, row in df.iterrows():
        if slugify_entity(str(row["district"])) == wanted:
            return dict(row)
    return None


def crop_code_for_name(name: str) -> str | None:
    """Map a canonical crop name (as used in analytics) to its ``crop_code``."""
    if not name:
        return None
    wanted = str(name).strip().lower()
    for _, row in _crop_rows().iterrows():
        if str(row["crop_name"]).strip().lower() == wanted:
            return str(row["crop_code"])
    return None


def district_code_for_name(name: str) -> str | None:
    """Map a district name to its ``district_code``."""
    if not name:
        return None
    wanted = str(name).strip().lower()
    for _, row in _district_rows().iterrows():
        if str(row["district"]).strip().lower() == wanted:
            return str(row["district_code"])
    return None
