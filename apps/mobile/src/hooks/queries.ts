/**
 * Shared React Query hooks for the analytical screens.
 *
 * They live here so the home preview, the crop board and the crop terminal
 * request the *same* data with the *same* query key: the board is fetched once
 * and reused everywhere instead of each screen issuing its own round trips.
 */

import { useQuery } from "@tanstack/react-query";

import { analyticsApi, cropsApi, districtsApi, metaApi } from "../services/api";

export function nationalBoardKey(crops?: string[]) {
  return ["national-board", crops?.length ? [...crops].sort().join(",") : "all"] as const;
}

/**
 * The national crop board.
 *
 * One request for the whole catalogue (or a named subset). Previously the board
 * issued one ``/analytics/trends`` request per crop — 17 cold round trips on a
 * phone — and derived each change on the device. The endpoint now returns the
 * shared period axis and the same-season delta, so this hook is both cheaper and
 * authoritative.
 *
 * `staleTime` is generous because the published releases change on the order of
 * seasons, not minutes.
 */
export function useNationalBoard(crops?: string[]) {
  return useQuery({
    queryKey: nationalBoardKey(crops),
    queryFn: () => analyticsApi.nationalBoard({ crops }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAllCrops() {
  return useQuery({ queryKey: ["crops"], queryFn: cropsApi.list });
}

export function useAllDistricts() {
  return useQuery({ queryKey: ["districts"], queryFn: districtsApi.list });
}

/** The published period dimension. Period selectors are built from this. */
export function usePeriods() {
  return useQuery({ queryKey: ["meta-periods"], queryFn: metaApi.periods });
}
