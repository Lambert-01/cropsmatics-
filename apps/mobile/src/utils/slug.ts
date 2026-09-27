/**
 * URL-safe entity helpers.
 *
 * A route must never interpolate a raw name (``/explore/crop/Irish Potato``).
 * Use the stable ``crop_code``/``district_code`` from the API, or a slugified
 * name. This mirrors ``app/services/slugs.py`` on the API so both sides agree.
 */
export function slugifyEntity(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve a crop to its route segment. Prefers the stable code, and falls back
 * to a slug of the name only when no code is available.
 */
export function resolveCropSlug(
  entity: { crop_code?: string | null; crop_name?: string | null } | null | undefined,
): string {
  if (!entity) return "";
  return entity.crop_code?.trim() || slugifyEntity(entity.crop_name);
}

export function resolveDistrictSlug(
  entity: { district_code?: string | null; district?: string | null } | null | undefined,
): string {
  if (!entity) return "";
  return entity.district_code?.trim() || slugifyEntity(entity.district);
}
