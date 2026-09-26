import type { CropSummary } from "../../types";
import { request } from "./client";

export const cropsApi = {
  list: () => request<CropSummary[]>("/crops"),
};
