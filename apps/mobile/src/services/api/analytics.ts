import type {
  PeriodProductivityResponse,
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
  postHarvest: (params?: { crop?: string }) =>
    request<Record<string, unknown>>(`/analytics/post-harvest${qs({ crop: params?.crop })}`),
  trends: (params?: { crop?: string; district?: string; compare?: string }) =>
    request<TrendResponse>(
      `/analytics/trends${qs({
        crop: params?.crop,
        district: params?.district,
        compare: params?.compare,
      })}`,
    ),
  inputAdoption: () => request<TrendResponse>("/analytics/input-adoption"),
};
