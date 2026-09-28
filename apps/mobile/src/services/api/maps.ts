import type { DistrictMetricsResponse } from "../../types";
import { qs, request } from "./client";

export type MapMetric =
  | "yield"
  | "gap"
  | "priority"
  | "input_adoption"
  | "irrigation"
  | "erosion";

export const mapsApi = {
  /**
   * District choropleth values. The period is passed as ``period_code``
   * (``2026B``); the previous ``period`` name was ignored by the API.
   *
   * ``metric: "yield"`` requires ``crop`` — raw yields from different crops are
   * not comparable, so the API returns an empty layer plus a message otherwise.
   */
  districtMetrics: (params?: {
    metric?: MapMetric;
    crop?: string;
    periodCode?: string;
  }) =>
    request<DistrictMetricsResponse>(
      `/maps/district-metrics${qs({
        metric: params?.metric,
        crop: params?.crop,
        period_code: params?.periodCode,
      })}`,
    ),
};
