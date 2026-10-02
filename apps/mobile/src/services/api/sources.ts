import type { DataSource, Provenance } from "../../types";
import { request } from "./client";

interface SourcesResponse {
  sources: DataSource[];
  provenance: Provenance;
}

export const sourcesApi = {
  list: () => request<SourcesResponse>("/meta/sources"),
};
