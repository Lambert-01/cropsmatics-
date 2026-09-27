import type { HomeData } from "../../types";
import { request } from "./client";

export const homeApi = {
  get: () => request<HomeData>("/mobile/home"),
};
