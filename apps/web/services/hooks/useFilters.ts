"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  parseFilters,
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

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, reset };
}
