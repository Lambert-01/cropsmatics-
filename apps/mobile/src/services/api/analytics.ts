import type { ProductivityResponse, TrendResponse } from "../../types";
import { qs, request } from "./client";

export const analyticsApi = {
  productivity: (params?: { crop?: string; district?: string; period?: string }) =>
    request<ProductivityResponse>(
      `/analytics/productivity${qs({
        crop: params?.crop,
        district: params?.district,
        period: params?.period,
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
