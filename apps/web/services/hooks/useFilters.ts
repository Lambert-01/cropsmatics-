"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  parseFilters,
  type DashboardFilters,
} from "@/lib/filters";

/**
 * Reads and writes the shared dashboard filters through the URL search params,
 * so every change requeries the API and every view is shareable.
 */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<DashboardFilters>(() => parseFilters(searchParams), [searchParams]);

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
