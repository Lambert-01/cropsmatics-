import type { PostHarvestResponse } from "../../types";
import { qs, request } from "./client";

export const postHarvestApi = {
  summary: (params?: { crop?: string }) =>
    request<PostHarvestResponse>(`/analytics/post-harvest${qs({ crop: params?.crop })}`),
  storageInfrastructure: () => request<Record<string, unknown>>("/analytics/storage-infrastructure"),
};
