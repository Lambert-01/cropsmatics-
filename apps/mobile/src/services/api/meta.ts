import type { PeriodsResponse } from "../../types";
import { request } from "./client";

export interface DataCoverage {
  coverage: Record<string, Record<string, string>>;
  notes: string[];
}

export interface DataVersion {
  available: boolean;
  pipeline_version?: string | null;
  build_timestamp?: string | null;
  validation?: { status?: string; errors?: number; warnings?: number };
}

export interface SourceItem {
  source_id: string;
  name: string;
  description?: string | null;
  coverage?: string | null;
  period?: string | null;
  url?: string | null;
  limitations?: string[] | null;
}

export const metaApi = {
  coverage: () => request<DataCoverage>("/meta/data-coverage"),
  dataVersion: () => request<DataVersion>("/meta/data-version"),
  sources: () => request<{ sources: SourceItem[] }>("/meta/sources"),
  /**
   * The published period dimension, derived from the data. Period selectors must
   * be built from this so an unpublished season (2026 Season C) is never offered.
   */
  periods: () => request<PeriodsResponse>("/meta/periods"),
};
