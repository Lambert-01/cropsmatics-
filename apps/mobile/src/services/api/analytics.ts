import type {
  FactorsResponse,
  IndexedYieldResponse,
  NationalBoardResponse,
  PeriodProductivityResponse,
  PeriodTrendResponse,
  PostHarvestResponse,
  TrendResponse,
} from "../../types";
import { qs, request } from "./client";

export const analyticsApi = {
  /**
   * Canonical period-aware productivity panel (``/productivity``).
   *
   * The parameter is ``period_code`` (e.g. ``2026B``): the legacy ``period``
   * name was ignored by the API and silently returned the latest release
   * instead of the requested one.
   */
  productivity: (params?: { crop?: string; district?: string; periodCode?: string }) =>
    request<PeriodProductivityResponse>(
      `/productivity${qs({
        crop: params?.crop,
        district: params?.district,
        period_code: params?.periodCode,
      })}`,
    ),
  /**
   * One crop across every published period, district or national.
   *
   * This is the canonical multi-period panel: it carries ``yield_kg_ha`` for a
   * district series and returns no point at all for a period the crop was not
   * tabulated in, so a chart shows a gap instead of a zero.
   *
   * ``season`` (A/B/C) restricts the series to one season across years — the
   * same-season view. It is a server-side filter, not a client-side guess.
   */
  periodTrend: (params: { crop: string; district?: string; season?: string }) =>
    request<PeriodTrendResponse>(
      `/productivity/trend${qs({
        crop: params.crop,
        district: params.district,
        season: params.season,
      })}`,
    ),
  postHarvest: (params?: { crop?: string }) =>
    request<PostHarvestResponse>(`/analytics/post-harvest${qs({ crop: params?.crop })}`),
  /**
   * National crop trends. The backend accepts only ``crop`` and ``compare``;
   * district time series belong to ``/productivity/trend`` instead. Keeping the
   * client signature exact prevents a district selector from appearing to work
   * while the server silently ignores it.
   */
  trends: (params?: { crop?: string; compare?: string }) =>
    request<TrendResponse>(
      `/analytics/trends${qs({
        crop: params?.crop,
        compare: params?.compare,
      })}`,
    ),
  /**
   * The whole national crop board in one read.
   *
   * Replaces one ``/analytics/trends`` request per crop. Every series is aligned
   * to ``periods`` and the same-season delta is computed by the service, so the
   * client only presents numbers it did not derive.
   */
  nationalBoard: (params?: { crops?: string[] }) =>
    request<NationalBoardResponse>(
      `/analytics/national-board${qs({ crops: params?.crops?.join(",") })}`,
    ),
  /**
   * Yield performance indexed to each crop's own published baseline.
   *
   * This is the only way the app compares yields across crops: the Python
   * service divides each crop by its own baseline (= 100) and returns the
   * eligibility rules and limitations with the result. The mobile client never
   * computes a cross-crop yield average.
   */
  indexedYield: (params: { crops: string[] }) =>
    request<IndexedYieldResponse>(
      `/analytics/indexed-yield${qs({ crops: params.crops.join(",") })}`,
    ),
  inputAdoption: () => request<TrendResponse>("/analytics/input-adoption"),
  /**
   * District practice adoption correlated with a crop's yield.
   *
   * A crop selection is required: comparing yields across unrelated crops would
   * distort the association. The response carries the coefficient, the sample
   * size and the "association only" interpretation with it.
   */
  factors: (params: { crop: string; district?: string }) =>
    request<FactorsResponse>(
      `/analytics/factors${qs({ crop: params.crop, district: params.district })}`,
    ),
};
