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
  districtMetrics: (params?: { metric?: MapMetric; crop?: string; period?: string }) =>
    request<DistrictMetricsResponse>(
      `/maps/district-metrics${qs({
        metric: params?.metric,
        crop: params?.crop,
        period: params?.period,
      })}`,
    ),
};
