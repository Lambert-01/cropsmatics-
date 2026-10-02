import type {
  CropSummary,
  ProductivityResponse,
  TrendResponse,
} from "../../types";
import { qs, request } from "./client";

export const cropsApi = {
  list: () => request<CropSummary[]>("/crops"),
  /** Look up by stable crop_code (CROP-MAI) or slug (maize). */
  get: (slug: string) => request<CropSummary>(`/crops/${encodeURIComponent(slug)}`),
  productivity: (crop: string) =>
    request<ProductivityResponse>(`/analytics/productivity${qs({ crop })}`),
  trends: (crop: string) => request<TrendResponse>(`/analytics/trends${qs({ crop })}`),
};
