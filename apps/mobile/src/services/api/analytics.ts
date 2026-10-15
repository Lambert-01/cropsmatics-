import type {
  FactorsResponse,
  ForecastStatusResponse,
  ForecastScope,
  IndexedYieldResponse,
  NationalBoardResponse,
  PeriodProductivityResponse,
  PeriodTrendResponse,
  PostHarvestHistoryResponse,
  PostHarvestResponse,
  PracticeIndicatorResponse,
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
  nationalBoard: (params?: {
    crops?: string[];
    /** One published period (``2025B``). Takes precedence over year/season. */
    periodCode?: string | null;
    /** Every published season of this year, resolved server-side. */
    year?: number | null;
    season?: string | null;
  }) =>
    request<NationalBoardResponse>(
      `/analytics/national-board${qs({
        crops: params?.crops?.join(","),
        period_code: params?.periodCode ?? undefined,
        year: params?.year ?? undefined,
        season: params?.season ?? undefined,
      })}`,
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
   * Multi-period district practice/irrigation/water/erosion observations
   * (2024A–2026B). This is the period-aware companion to the legacy
   * single-release irrigation/erosion tables, which stay unchanged.
   *
   * ``domain`` names one of practice | irrigation | water_source |
   * erosion_control | erosion_severity; omit it for all domains.
   */
  practiceIndicators: (params?: {
    domain?: string;
    periodCode?: string;
    year?: number;
    season?: string;
    district?: string;
    province?: string;
    limit?: number;
  }) =>
    request<PracticeIndicatorResponse>(
      `/analytics/practice-indicators${qs({
        domain: params?.domain,
        period_code: params?.periodCode,
        year: params?.year,
        season: params?.season,
        district: params?.district,
        province: params?.province,
        limit: params?.limit,
      })}`,
    ),
  /**
   * Multi-period crop post-harvest use shares (2024A–2026B). Reports the
   * published share totals per period × crop and how many fall outside the
   * rounding tolerance, so a screen can say so rather than silently rescaling.
   */
  postharvestHistory: (params?: {
    periodCode?: string;
    year?: number;
    season?: string;
    crop?: string;
    limit?: number;
  }) =>
    request<PostHarvestHistoryResponse>(
      `/analytics/postharvest-history${qs({
        period_code: params?.periodCode,
        year: params?.year,
        season: params?.season,
        crop: params?.crop,
        limit: params?.limit,
      })}`,
    ),
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
  /**
   * The forecast publication decision, served verbatim from the chronological
   * backtest.
   *
   * `serves_forecast` is the only field to branch on. When it is false there is
   * no forecast to draw — the response carries the evidence verdict and the
   * gates that failed, which is a complete answer rather than an outage. The
   * device never generates, estimates or extrapolates a forecast locally.
   */
  forecastStatus: (scope: ForecastScope = {}) =>
    request<ForecastStatusResponse>(`/analytics/forecast-status${qs({ ...scope })}`),
};
