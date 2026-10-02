/**
 * Fill `{name}` tokens in a localised template.
 *
 * A token with no supplied value is left untouched rather than replaced with an
 * empty string, so a missing parameter is visible instead of silently producing
 * a sentence with a hole in it. Pure, so it is unit tested.
 */
export function fillTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}
