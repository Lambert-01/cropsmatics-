import type { KPI } from "@/types";

/**
 * Global KPI policy: no page may render more than four primary KPI cards.
 *
 * The backend already returns ``primary_kpis`` (at most four, one analytical
 * scope, one period) alongside ``secondary_kpis``. These helpers are the client
 * side of the same rule, and are deliberately *not* ``kpis.slice(0, 4)``:
 * a page must headline the API's explicit primary selection so a context figure
 * from another release (e.g. a 2025B practice adoption value) can never take a
 * headline slot next to 2026B observations.
 */
export const MAX_PRIMARY_KPIS = 4;

export function selectPrimaryKpis(kpis: KPI[], primaryKpis?: KPI[]): KPI[] {
  const source = primaryKpis && primaryKpis.length > 0 ? primaryKpis : kpis;
  return source.slice(0, MAX_PRIMARY_KPIS);
}

/**
 * Pick the headline KPIs by explicit id, in the page's own priority order.
 *
 * A page that needs a different headline set (Yield Intelligence headlines a
 * same-season change; Productivity headlines production) names its ids instead
 * of inheriting whatever the API happens to return first. Ids absent from the
 * response are skipped, so a page still renders when a metric is unavailable.
 */
export function pickKpisByIds(kpis: KPI[], ids: string[]): KPI[] {
  const byId = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  return ids
    .map((id) => byId.get(id))
    .filter((kpi): kpi is KPI => Boolean(kpi))
    .slice(0, MAX_PRIMARY_KPIS);
}

export function selectSecondaryKpis(
  kpis: KPI[],
  primaryKpis?: KPI[],
  secondaryKpis?: KPI[],
): KPI[] {
  const primaryIds = new Set(selectPrimaryKpis(kpis, primaryKpis).map((kpi) => kpi.id));
  if (secondaryKpis && secondaryKpis.length > 0) {
    return secondaryKpis.filter((kpi) => !primaryIds.has(kpi.id));
  }
  return kpis.filter((kpi) => !primaryIds.has(kpi.id));
}

/** Every primary KPI must describe the scope and period of the selection. */
export function primaryKpisAreConsistent(primary: KPI[], periodCode?: string | null): boolean {
  if (primary.length === 0) return true;
  if (primary.some((kpi) => kpi.scope === "context")) return false;
  if (!periodCode) return true;
  return primary.every((kpi) => !kpi.period_code || kpi.period_code === periodCode);
}
