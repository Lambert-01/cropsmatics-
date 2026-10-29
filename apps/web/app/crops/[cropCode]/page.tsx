"use client";

import { ArrowLeft, Snowflake, Warehouse, Wheat } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProvenanceCard } from "@/components/ProvenanceCard";
import { AnalyticsFilterBar } from "@/components/filters/AnalyticsFilterBar";
import { PageHero } from "@/components/layout/PageHero";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataBadge } from "@/components/ui/DataBadge";
import { EmptyState, ErrorState, KpiRowSkeleton } from "@/components/ui/States";
import { DashboardKpis } from "@/features/dashboard/DashboardKpis";
import { ProductivityRiskMap } from "@/features/dashboard/ProductivityRiskMap";
import { CropPostHarvestCard } from "@/features/crops/CropPostHarvestCard";
import { TrendCompareControl } from "@/features/crops/TrendCompareControl";
import { resolveCrop } from "@/features/crops/catalog";
import { CropTrendChart, type CropTrendMetric } from "@/features/crops/CropTrendChart";
import { DistrictRankingTable } from "@/features/productivity/DistrictRankingTable";
import { FactorAssociationChart } from "@/features/productivity/FactorAssociationChart";
import { GapRankedBars } from "@/features/productivity/GapRankedBars";
import { FieldEvidenceSummary } from "@/features/maps/FieldEvidenceSummary";
import { splitPeriod } from "@/lib/filters";
import { useCrops } from "@/services/hooks/useReference";
import {
  useFactors,
  useFieldObservations,
  usePostHarvest,
  useProductivity,
  useProductivityTrend,
} from "@/services/hooks/useAnalytics";
import { useFilters } from "@/services/hooks/useFilters";

/**
 * Crop Intelligence — one crop, end to end.
 *
 * The crop is fixed by the route, so the shared filter bar carries only
 * period/season/geography/benchmark; the crop is written into the URL once on
 * mount so every link to this page stays shareable and every dependent query
 * resolves the same crop. All values come from the Python API for that selection
 * — the page computes no analytical figure of its own.
 */
export default function CropIntelligencePage() {
  const params = useParams<{ cropCode: string }>();
  const code = decodeURIComponent(String(params?.cropCode ?? ""));
  const { filters, setFilters } = useFilters();
  const [trendMetric, setTrendMetric] = useState<CropTrendMetric>("yield_kg_ha");
  // "" = no overlay; "national" = the national series; otherwise a district name.
  const [compareTarget, setCompareTarget] = useState("");

  const crops = useCrops();
  const crop = useMemo(() => resolveCrop(crops.data, code), [crops.data, code]);
  const cropName = crop?.crop_name;

  // Pin the crop into the shared filter state once it is resolved, without
  // clobbering any other filter the URL already carries.
  useEffect(() => {
    if (cropName && filters.crop !== cropName) setFilters({ crop: cropName });
  }, [cropName, filters.crop, setFilters]);

  // Queries use the resolved crop immediately, so the first paint after the crop
  // catalogue loads is already scoped — no flash of a cross-crop value.
  const effectiveFilters = useMemo(
    () => ({ ...filters, crop: cropName ?? filters.crop }),
    [filters, cropName],
  );

  const productivity = useProductivity(effectiveFilters, Boolean(cropName));
  // District performance is shown only when the panel's own rows actually carry
  // districts. A national-only panel is never rendered as if it were district
  // level, and no district figure is inferred for it.
  const districtMode = useMemo(
    () =>
      Boolean(cropName) &&
      (productivity.data?.rows ?? []).some(
        (row) => typeof row.district === "string" && row.district.trim() !== "",
      ),
    [productivity.data, cropName],
  );
  const season = splitPeriod(filters.period).season ?? filters.season;
  const trend = useProductivityTrend(cropName, filters.district, season, Boolean(cropName));

  const compareNational = compareTarget === "national";
  const compareDistrictName = compareTarget && !compareNational ? compareTarget : undefined;
  // The overlay reads the same canonical panel as the primary series, so the two
  // lines are strictly comparable: same crop, same season scope, same units.
  const nationalTrend = useProductivityTrend(
    cropName,
    undefined,
    season,
    Boolean(cropName) && compareNational && Boolean(filters.district),
  );
  const districtTrend = useProductivityTrend(
    cropName,
    compareDistrictName,
    season,
    Boolean(cropName) && Boolean(compareDistrictName),
  );
  const comparisonData = compareNational ? nationalTrend.data : districtTrend.data;
  const comparisonLabel = compareNational ? "National" : (compareDistrictName ?? null);

  // A district cannot be compared with itself; if the primary selection moves
  // onto the chosen overlay, drop the overlay rather than draw two identical lines.
  useEffect(() => {
    if (compareDistrictName && compareDistrictName === filters.district) setCompareTarget("");
  }, [compareDistrictName, filters.district]);
  const factors = useFactors(effectiveFilters, Boolean(cropName));
  const postHarvest = usePostHarvest(effectiveFilters);
  const fieldObservations = useFieldObservations(effectiveFilters);
  const benchmarkStrategy =
    productivity.data?.provenance?.benchmark_strategy ?? filters.benchmark ?? null;

  if (crops.isLoading) {
    return (
      <div className="space-y-5">
        <PageHero title="Crop Intelligence" subtitle="Loading the crop catalogue…" />
        <KpiRowSkeleton count={4} />
      </div>
    );
  }

  if (!crop) {
    return (
      <div className="space-y-5">
        <PageHero
          title="Crop not found"
          subtitle="This crop code is not in the published crop catalogue."
        />
        <EmptyState
          title={`No crop matches "${code}".`}
          hint="Open the crop catalogue to pick a crop from the published list."
        />
        <Link href="/crops" className="btn btn-primary w-fit">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to crops
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHero
        title={crop.crop_name}
        subtitle={`Crop Intelligence — productivity, geography and post-harvest for ${crop.crop_name}, from published statistics.`}
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Link
          href="/crops"
          className="btn text-xs"
          aria-label="Back to the crop catalogue"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All crops
        </Link>
      </div>

      <Card>
        <CardHeader
          title={crop.crop_name}
          subtitle={crop.category ? `Category: ${crop.category}` : "Crop catalogue entry"}
          action={<DataBadge kind="official_national" />}
        />
        <dl className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Kinyarwanda name
            </dt>
            <dd className="text-slate-700">{crop.kinyarwanda_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Perishability
            </dt>
            <dd className="text-slate-700">{crop.perishability ?? "Not published"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Cold chain
            </dt>
            <dd className="flex items-center gap-1.5 text-slate-700">
              {crop.cold_chain_recommended ? (
                <>
                  <Snowflake className="h-3.5 w-3.5 text-info" aria-hidden="true" /> Recommended
                </>
              ) : (
                "Not flagged"
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <AnalyticsFilterBar
        supported={["year", "season", "province", "district", "benchmark"]}
        datasetNote={`Crop is fixed to ${crop.crop_name} on this page. Use the crop catalogue to switch crops.`}
      />

      {productivity.error ? (
        <ErrorState
          message={(productivity.error as Error).message}
          onRetry={() => productivity.refetch()}
        />
      ) : null}
      {productivity.isLoading ? <KpiRowSkeleton count={4} /> : null}

      {productivity.data ? (
        <DashboardKpis
          kpis={productivity.data.kpis}
          primaryKpis={productivity.data.primary_kpis}
          secondaryKpis={productivity.data.secondary_kpis}
        />
      ) : null}

      <FieldEvidenceSummary
        data={fieldObservations.data}
        filters={effectiveFilters}
        isLoading={fieldObservations.isLoading}
        isError={fieldObservations.isError}
        onRetry={() => void fieldObservations.refetch()}
      />

      <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
        <TrendCompareControl
          value={compareTarget}
          onChange={setCompareTarget}
          primaryDistrict={filters.district}
        />
        <p className="text-[11px] text-slate-500">
          Overlays a second published series on the same period axis. A period only one side
          published is drawn on that side alone.
        </p>
      </div>

      <CropTrendChart
        data={trend.data}
        isLoading={trend.isLoading && Boolean(cropName)}
        metric={trendMetric}
        onMetricChange={setTrendMetric}
        crop={crop.crop_name}
        district={filters.district}
        comparison={comparisonData}
        comparisonLabel={comparisonLabel}
      />

      {districtMode ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <GapRankedBars
              rows={productivity.data?.rows ?? []}
              isLoading={productivity.isLoading}
              period={productivity.data?.period}
              benchmark={benchmarkStrategy}
            />
            <FactorAssociationChart
              data={factors.data}
              isLoading={factors.isLoading}
              crop={cropName}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ProductivityRiskMap
              filters={effectiveFilters}
              selectedDistrict={filters.district}
              onSelectDistrict={(d) => setFilters({ district: d })}
              height={420}
            />
            <DistrictRankingTable
              rows={productivity.data?.rows ?? []}
              onSelectDistrict={(d) => setFilters({ district: d })}
            />
          </div>
        </>
      ) : productivity.data ? (
        <Card>
          <CardHeader
            title="District performance"
            subtitle="District-level comparison is not published for this crop and selection"
          />
          <div className="px-4 pb-4">
            <EmptyState
              title="No district-level panel for this selection."
              hint="The productivity panel reported national coverage only. Pick a district release, or another crop."
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <CropPostHarvestCard
          crops={postHarvest.data?.crops ?? []}
          cropName={crop.crop_name}
          isLoading={postHarvest.isLoading}
        />
        <Card>
          <CardHeader
            title="What this page reports"
            subtitle="Scope, units and honest limits of the crop view"
          />
          <ul className="space-y-2 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <li className="flex items-start gap-2">
              <Wheat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              Every figure is the Python API&apos;s published value for the current period, geography and
              benchmark. The page computes no analytical value of its own.
            </li>
            <li className="flex items-start gap-2">
              <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              Post-harvest shares are national, crop level. The district filter does not apply to that
              table and no district post-harvest value is inferred.
            </li>
            <li className="text-slate-500">
              Associations describe priorities for investigation; they are not proven causal effects.
            </li>
          </ul>
        </Card>
      </div>

      {productivity.data ? <ProvenanceCard provenance={productivity.data.provenance} /> : null}
    </div>
  );
}
