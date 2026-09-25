"use client";

import { useMemo, useState } from "react";

import { ResponsiveTable, type Column } from "@/components/table/ResponsiveTable";
import { TableToolbar } from "@/components/table/TableToolbar";
import { PriorityBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { fmtNumber } from "@/lib/format";
import type { PostHarvestCrop } from "@/types";

/**
 * Loss classification by crop (section L): searchable crop filter plus sortable
 * Loss, Stored, Sold and Risk Band columns; percentages are explicit in the
 * headers with tabular numeric alignment.
 */
export function RiskClassificationTable({ crops }: { crops: PostHarvestCrop[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" }>({
    id: "loss",
    direction: "desc",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? crops.filter((c) => c.crop.toLowerCase().includes(q)) : crops;
  }, [crops, search]);

  const columns: Column<PostHarvestCrop>[] = [
    {
      id: "crop",
      header: "Crop",
      width: 170,
      sticky: true,
      sortable: true,
      sortValue: (c) => c.crop,
      cell: (c) => <span className="font-medium text-slate-700">{c.crop}</span>,
    },
    {
      id: "loss",
      header: "Loss",
      unit: "% of production",
      width: 130,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (c) => c.post_harvest_losses_pct ?? null,
      cell: (c) => (
        <span className="font-medium">{fmtNumber(c.post_harvest_losses_pct ?? null, 2)}%</span>
      ),
    },
    {
      id: "stored",
      header: "Stored",
      unit: "%",
      width: 100,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (c) => c.stored_pct ?? null,
      cell: (c) => fmtNumber(c.stored_pct ?? null, 2),
    },
    {
      id: "sold",
      header: "Sold",
      unit: "%",
      width: 100,
      align: "right",
      numeric: true,
      sortable: true,
      sortValue: (c) => c.sold_pct ?? null,
      cell: (c) => fmtNumber(c.sold_pct ?? null, 2),
    },
    {
      id: "band",
      header: "Risk band",
      width: 120,
      sortable: true,
      sortValue: (c) => c.risk_band ?? null,
      cell: (c) => <PriorityBadge band={c.risk_band} />,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Loss classification by crop"
        subtitle="Heuristic bands on the reported loss share — not model probabilities"
      />
      {crops.length === 0 ? (
        <div className="p-4">
          <EmptyState />
        </div>
      ) : (
        <>
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search crop…"
            sort={sort}
            onSortChange={setSort}
            resultCount={filtered.length}
            totalCount={crops.length}
            onReset={() => {
              setSearch("");
              setSort({ id: "loss", direction: "desc" });
            }}
          />
          <div className="thin-scroll max-h-[26rem] overflow-auto">
            <ResponsiveTable
              columns={columns}
              rows={filtered}
              rowKey={(c) => c.crop}
              sort={sort}
              onSortChange={(s) => setSort(s ?? { id: "loss", direction: "desc" })}
              caption="Reported post-harvest loss, storage and sold share per crop with risk band"
            />
          </div>
        </>
      )}
      <SourceNote>
        Bands: HIGH ≥ 1.0%, MODERATE ≥ 0.5%, otherwise LOW. Thresholds are documented in
        postharvest_service and are not calibrated risk probabilities.
      </SourceNote>
    </Card>
  );
}
