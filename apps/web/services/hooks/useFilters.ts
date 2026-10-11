"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  parseFilters,
  SCOPE_HISTORY,
  type DashboardFilters,
} from "@/lib/filters";
import { resolveAnalyticalContext } from "@/lib/preferences";
import { usePreferences } from "@/components/providers/PreferencesProvider";

/**
 * Reads and writes the shared dashboard filters through the URL search params,
 * so every change requeries the API and every view is shareable.
 *
 * The URL is still the single source of truth. The user's stored defaults fill
 * only the gaps the URL leaves, which is what keeps a shared link faithful while
 * still letting someone configure the context they want to land in.
 *
 * `filters.view` is always resolved (never undefined), so every consumer sees
 * the same answer to "is this all published periods, or one release?" that the
 * API request is built from.
 */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { preferences } = usePreferences();

  const filters = useMemo<DashboardFilters>(() => {
    const parsed = parseFilters(searchParams);
    const context = resolveAnalyticalContext(preferences, parsed);
    return {
      ...parsed,
      view: context.view,
      period: context.period,
      crop: context.crop,
      province: context.province,
      district: context.district,
    };
  }, [searchParams, preferences]);

  const setFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      (Object.keys(patch) as (keyof DashboardFilters)[]).forEach((key) => {
        const value = patch[key];
        if (value === undefined || value === "" || value === null) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /**
   * Reset every filter to its default: all published periods, all crops, all
   * districts, the default benchmark.
   *
   * The reset is written down as `view=history`. Merely clearing the URL is not
   * enough: the stored preferences would re-apply a saved default period on the
   * very next render, so "reset" would quietly mean "my saved period" for some
   * users and "all published periods" for others - and would change again after
   * a reload. One documented meaning, the same on every page.
   */
  const reset = useCallback(() => {
    router.replace(`${pathname}?view=${SCOPE_HISTORY}`, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, reset };
}
