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
  // `/analytics/national-board` only needs a server-side subset when at least
  // two crops are requested. A one-crop detail view reuses the cached full board
  // and selects its crop locally; this avoids sending an invalid one-item
  // `crops=` query while keeping Home/Crops/Crop Detail on one authoritative
  // response and one network request.
  const subset = crops && crops.length >= 2 ? [...crops].sort().join(",") : "all";
  return ["national-board", subset] as const;
}

/**
 * The national crop board.
 *
 * One request for the whole catalogue (or a named subset of at least two crops).
 * Previously the board issued one `/analytics/trends` request per crop — 17 cold
 * round trips on a phone — and derived each change on the device. The endpoint
 * now returns the shared period axis and the same-season delta, so this hook is
 * both cheaper and authoritative.
 *
 * A one-crop observer (Crop Detail) deliberately reads the shared full-board
 * cache and filters the returned crop array with React Query's per-observer
 * `select`; the backend's subset contract therefore stays exact and the detail
 * screen cannot receive a 422 for a one-item `crops` parameter.
 *
 * `staleTime` is generous because the published releases change on the order of
 * seasons, not minutes.
 */
export function useNationalBoard(crops?: string[]) {
  const requestedSubset = crops && crops.length >= 2 ? crops : undefined;
  const selectedCrop = crops?.length === 1 ? crops[0].toLowerCase() : null;

  return useQuery({
    queryKey: nationalBoardKey(crops),
    queryFn: () => analyticsApi.nationalBoard({ crops: requestedSubset }),
    select: selectedCrop
      ? (data) => ({
          ...data,
          crops: data.crops.filter((item) => item.crop.toLowerCase() === selectedCrop),
        })
      : undefined,
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
