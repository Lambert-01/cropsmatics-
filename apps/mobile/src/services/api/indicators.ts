import type { IndicatorsResponse } from "../../types";
import { request } from "./client";

export const indicatorsApi = {
  list: () => request<IndicatorsResponse>("/mobile/indicators"),
};
