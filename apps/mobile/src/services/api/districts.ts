import type { DistrictSummary } from "../../types";
import { request } from "./client";

export const districtsApi = {
  list: () => request<DistrictSummary[]>("/geography/districts"),
  provinces: () =>
    request<{ province: string; districts: DistrictSummary[] }[]>("/geography/provinces"),
};
