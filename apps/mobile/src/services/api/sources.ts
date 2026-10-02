import type { DataSource } from "../../types";
import { request } from "./client";

interface SourcesResponse {
  sources: DataSource[];
  provenance: Record<string, unknown>;
}

export const sourcesApi = {
  list: () => request<SourcesResponse>("/meta/sources"),
};
