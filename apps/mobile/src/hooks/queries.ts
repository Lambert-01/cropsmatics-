/**
 * Shared React Query hooks for the analytical screens.
 *
 * They live here so the home preview, the crop board and the crop terminal
 * request the *same* data with the *same* query key: the board is fetched once
 * and reused everywhere instead of each screen issuing its own round trips.
 */

import { useQuery } from "@tanstack/react-query";

import { analyticsApi, cropsApi, districtsApi, metaApi } from "../services/api";

/**
 * A published-period scope for the national board.
 *
 * ``periodCode`` selects exactly one release; ``year`` selects every season NISR
 * published for that year; ``season`` narrows a year. The server resolves all
 * three against the period catalogue, so the client can never ask for a season
 * whose observations do not exist and receive a silently empty board.
 */
export interface BoardScope {
  periodCode?: string | null;
  year?: number | null;
  season?: string | null;
}

function boardScopeKey(scope?: BoardScope): string {
  if (!scope) return "all";
  const { periodCode, year, season } = scope;
  if (!periodCode && !year && !season) return "all";
  return [periodCode ?? "-", year ?? "-", season ?? "-"].join(":");
}

export function nationalBoardKey(crops?: string[], scope?: BoardScope) {
  // `/analytics/national-board` only needs a server-side subset when at least
  // two crops are requested. A one-crop detail view reuses the cached full board
  // and selects its crop locally; this avoids sending an invalid one-item
  // `crops=` query while keeping Home/Crops/Crop Detail on one authoritative
  // response and one network request.
  const subset = crops && crops.length >= 2 ? [...crops].sort().join(",") : "all";
  // The scope is part of the key, so a different year is a different cache entry
  // rather than a stale board that still shows the previous period's numbers.
  return ["national-board", subset, boardScopeKey(scope)] as const;
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
export function useNationalBoard(crops?: string[], scope?: BoardScope) {
  const requestedSubset = crops && crops.length >= 2 ? crops : undefined;
  const selectedCrop = crops?.length === 1 ? crops[0].toLowerCase() : null;

  return useQuery({
    queryKey: nationalBoardKey(crops, scope),
    queryFn: () =>
      analyticsApi.nationalBoard({
        crops: requestedSubset,
        periodCode: scope?.periodCode ?? undefined,
        year: scope?.year ?? undefined,
        season: scope?.season ?? undefined,
      }),
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

/**
 * Multi-period district practice/irrigation/water/erosion observations.
 *
 * The scope (period/year/season plus district or domain) is part of the query
 * key so switching a district or a period reads a fresh slice instead of a
 * stale one, and the response carries its own coverage metadata for the UI to
 * state what is actually published.
 */
export function usePracticeIndicators(params?: {
  domain?: string;
  periodCode?: string;
  year?: number;
  season?: string;
  district?: string;
  province?: string;
  limit?: number;
  /** A screen that only renders one geography can hold the request until that
   *  geography is chosen instead of fetching a page of the full table. */
  enabled?: boolean;
}) {
  const domain = params?.domain ?? null;
  const periodCode = params?.periodCode ?? null;
  const year = params?.year ?? null;
  const season = params?.season ?? null;
  const district = params?.district ?? null;
  const province = params?.province ?? null;
  const limit = params?.limit ?? null;
  const enabled = params?.enabled ?? true;
  return useQuery({
    queryKey: ["practice-indicators", domain, periodCode, year, season, district, province, limit],
    queryFn: () =>
      analyticsApi.practiceIndicators({
        domain: domain ?? undefined,
        periodCode: periodCode ?? undefined,
        year: year ?? undefined,
        season: season ?? undefined,
        district: district ?? undefined,
        province: province ?? undefined,
        limit: limit ?? undefined,
      }),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}

/** Multi-period crop post-harvest use shares (2024A–2026B). */
export function usePostharvestHistory(params?: {
  periodCode?: string;
  year?: number;
  season?: string;
  crop?: string;
  limit?: number;
  /** A screen that only renders the panel for one crop can hold the request
   *  until that crop is chosen instead of fetching an unfiltered panel. */
  enabled?: boolean;
}) {
  const periodCode = params?.periodCode ?? null;
  const year = params?.year ?? null;
  const season = params?.season ?? null;
  const crop = params?.crop ?? null;
  const limit = params?.limit ?? null;
  const enabled = params?.enabled ?? true;
  return useQuery({
    queryKey: ["postharvest-history", periodCode, year, season, crop, limit],
    queryFn: () =>
      analyticsApi.postharvestHistory({
        periodCode: periodCode ?? undefined,
        year: year ?? undefined,
        season: season ?? undefined,
        crop: crop ?? undefined,
        limit: limit ?? undefined,
      }),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}
