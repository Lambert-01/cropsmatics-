import { request } from "./client";

export const analyticsApi = {
  productivity: (params?: { crop?: string; district?: string; period?: string }) => {
    const q = new URLSearchParams();
    if (params?.crop) q.set("crop", params.crop);
    if (params?.district) q.set("district", params.district);
    if (params?.period) q.set("period", params.period);
    const qs = q.toString();
    return request<unknown>(`/analytics/productivity${qs ? `?${qs}` : ""}`);
  },
  postHarvest: (params?: { crop?: string; period?: string }) => {
    const q = new URLSearchParams();
    if (params?.crop) q.set("crop", params.crop);
    if (params?.period) q.set("period", params.period);
    const qs = q.toString();
    return request<unknown>(`/analytics/post-harvest${qs ? `?${qs}` : ""}`);
  },
  trends: (params?: { crop?: string; district?: string }) => {
    const q = new URLSearchParams();
    if (params?.crop) q.set("crop", params.crop);
    if (params?.district) q.set("district", params.district);
    const qs = q.toString();
    return request<unknown>(`/analytics/trends${qs ? `?${qs}` : ""}`);
  },
  inputAdoption: (params?: { crop?: string; district?: string; period?: string }) => {
    const q = new URLSearchParams();
    if (params?.crop) q.set("crop", params.crop);
    if (params?.district) q.set("district", params.district);
    if (params?.period) q.set("period", params.period);
    const qs = q.toString();
    return request<unknown>(`/analytics/input-adoption${qs ? `?${qs}` : ""}`);
  },
};
