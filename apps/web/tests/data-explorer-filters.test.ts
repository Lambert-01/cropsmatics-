import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { DataTable, datasetCsvHref } from "@/features/data-explorer/DataTable";

type CatalogEntry = {
  key: string;
  label: string;
  source_id: string;
  group: string;
  group_label: string;
  filters: string[];
};

function renderTable(datasetKey: string, datasets: CatalogEntry[]): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["datasets"], { datasets });
  return renderToStaticMarkup(
    h(QueryClientProvider, { client }, h(DataTable, { datasetKey, label: "Test table" })),
  );
}

const catalog = (key: string, filters: string[]): CatalogEntry[] => [
  { key, label: key, source_id: "SRC", group: "current", group_label: "Current", filters },
];

describe("DataTable dataset-appropriate filters", () => {
  it("offers indicator and domain where the dataset carries them", () => {
    const html = renderTable(
      "agricultural_practice_observation",
      catalog("agricultural_practice_observation", [
        "period_code",
        "year",
        "season",
        "district",
        "province",
        "row_scope",
        "domain",
        "indicator_code",
        "source_id",
      ]),
    );
    expect(html).toContain('aria-label="Filter by indicator code"');
    expect(html).toContain('aria-label="Filter by domain"');
    expect(html).toContain('aria-label="Filter by period code"');
    // Search is always available; low-level code columns stay API-reachable.
    expect(html).toContain('aria-label="Search dataset rows"');
    expect(html).not.toContain('aria-label="Filter by row scope"');
  });

  it("shows only the filters a narrow dataset actually accepts", () => {
    const html = renderTable(
      "crop_postharvest_use",
      catalog("crop_postharvest_use", ["crop"]),
    );
    expect(html).toContain('aria-label="Filter by crop"');
    // Previously hardcoded on every dataset, so this table answered 400.
    expect(html).not.toContain('aria-label="Filter by district"');
    expect(html).not.toContain('aria-label="Filter by year"');
    expect(html).not.toContain('aria-label="Filter by indicator code"');
  });

  it("renders no filter boxes for a dataset without filterable columns", () => {
    const html = renderTable(
      "cold_chain_network_summary",
      catalog("cold_chain_network_summary", []),
    );
    expect(html).not.toContain('aria-label="Filter by ');
    expect(html).toContain('aria-label="Search dataset rows"');
  });
});

describe("datasetCsvHref", () => {
  it("carries search, filters and sort into the download URL", () => {
    const href = datasetCsvHref(
      "crop_productivity",
      "maize",
      { province: "Eastern", indicator_code: "" },
      "yield_kg_ha",
      "desc",
    );
    const url = new URL(href);
    expect(url.pathname).toContain("/reports/dataset/crop_productivity.csv");
    expect(url.searchParams.get("search")).toBe("maize");
    expect(url.searchParams.get("province")).toBe("Eastern");
    expect(url.searchParams.get("sort_by")).toBe("yield_kg_ha");
    expect(url.searchParams.get("sort_dir")).toBe("desc");
    // Empty values are dropped, not sent as `indicator_code=` noise.
    expect(url.searchParams.has("indicator_code")).toBe(false);
  });

  it("builds a bare URL when nothing is applied", () => {
    const href = datasetCsvHref("districts", "", {}, null, "asc");
    expect(href).toContain("/reports/dataset/districts.csv");
    expect(href.split("?").length).toBe(1);
  });
});
