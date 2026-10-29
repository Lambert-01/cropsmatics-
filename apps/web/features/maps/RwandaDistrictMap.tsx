"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { EmptyState, MapSkeleton, UpdatingPill } from "@/components/ui/States";
import { makeScale } from "@/features/maps/colors";
import { DistrictChoropleth } from "@/features/maps/DistrictChoropleth";
import { FacilityDistrictMarkers, FacilityLayer } from "@/features/maps/FacilityLayer";
import { YieldShortfallLayer } from "@/features/maps/YieldShortfallLayer";
import { MapControls } from "@/features/maps/MapControls";
import { MapLegend } from "@/features/maps/MapLegend";
import { MapTooltip } from "@/features/maps/MapTooltip";
import { buildProjection, type GeoCollection, type GeoFeature } from "@/features/maps/geo";
import { cn } from "@/lib/cn";
import { METRIC_SEMANTICS, type MapMetricId } from "@/lib/constants";
import { benchmarkLabel, periodLabel } from "@/lib/format";
import { unavailableSummary } from "@/lib/priority";
import type { FacilityItem, MapMetricsResponse } from "@/types";

const VIEW_W = 1000;
const VIEW_H = 880;
const SHORTFALL_GAP = 20; // % below benchmark -> hatched yield-shortfall overlay

export function RwandaDistrictMap({
  data,
  metric,
  isFetching = false,
  onMetricChange,
  onSelectDistrict,
  selectedDistrict,
  facilities = [],
  showProgramDistricts = true,
  height = 460,
  title = "Rwanda Productivity & Risk Map",
}: {
  data?: MapMetricsResponse;
  metric: MapMetricId;
  isFetching?: boolean;
  onMetricChange: (metric: MapMetricId) => void;
  onSelectDistrict?: (district: string) => void;
  selectedDistrict?: string | null;
  facilities?: FacilityItem[];
  /** Enable the optional operational cold-chain overlay for map/storage views. */
  showProgramDistricts?: boolean;
  height?: number;
  title?: string;
}) {
  const [collection, setCollection] = useState<GeoCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `null` means "follow the stored preference"; a local toggle overrides it for
  // this view without changing what the reader has saved in Settings.
  const [labelOverride, setLabelOverride] = useState<boolean | null>(null);
  const [showFacilities, setShowFacilities] = useState(false);
  const { preferences } = usePreferences();
  const showLabels = labelOverride ?? preferences.mapLabels;
  const [hovered, setHovered] = useState<{ feature: GeoFeature; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/geodata/rwanda_districts.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`geojson ${r.status}`);
        return r.json();
      })
      .then((json: GeoCollection) => active && setCollection(json))
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, []);

  const project = useMemo(
    () => (collection ? buildProjection(collection.features, VIEW_W, VIEW_H, 16) : null),
    [collection],
  );

  const datumByDistrict = useMemo(() => {
    const map = new Map<string, MapMetricsResponse["districts"][number]>();
    (data?.districts ?? []).forEach((d) => {
      if (d.district_code) map.set(d.district_code, d);
    });
    return map;
  }, [data]);
  const facilityByDistrict = useMemo(() => new Map(
    facilities.filter((f) => f.district_code).map((f) => [f.district_code, f]),
  ), [facilities]);

  // The service reports a null range when the metric has no published value for
  // this selection. That null is passed through rather than turned into 0..1, so
  // the legend reports the absence instead of inventing a span.
  const scale = useMemo(
    () =>
      makeScale(
        data?.min_value,
        data?.max_value,
        METRIC_SEMANTICS[metric].scaleKind,
      ),
    [data, metric],
  );

  const shortfall = useMemo(() => {
    const set = new Set<string>();
    (data?.districts ?? []).forEach((d) => {
      const gap = d.details?.gap_index;
      if (d.district_code && typeof gap === "number" && gap >= SHORTFALL_GAP) set.add(d.district_code);
    });
    return set;
  }, [data]);

  const colorFor = (districtCode: string) => {
    const datum = datumByDistrict.get(districtCode);
    if (!datum) return scale.color(null);
    // A banded score is coloured from the API's own band label when it has one, so
    // the map can never disagree with the ranking about a district's band.
    if (scale.kind === "bands") {
      return scale.colorForBand(datum.details?.priority_band as string | null, datum.value);
    }
    return scale.color(datum.value ?? null);
  };

  const labelFor = (districtCode: string) => {
    const datum = datumByDistrict.get(districtCode);
    return datum?.value != null ? `${datum.value}` : "no verified data";
  };

  if (error) {
    return (
      <Card>
        <CardHeader title={title} />
        <div className="px-4 pb-4 text-sm text-slate-600">
          The district boundary file could not be loaded. Run{" "}
          <code>python scripts/data/build_geodata.py</code> to regenerate it.
        </div>
      </Card>
    );
  }

  if (!collection || !project) {
    return <MapSkeleton height={height} />;
  }

  // The service refuses to colour a layer it cannot answer for the current
  // selection: a raw yield with no crop, or a single-release adoption layer on
  // another period. Render its explanation instead of a misleading map.
  const blocked = Boolean(data?.message) && (data?.districts?.length ?? 0) === 0;
  const blockedHint = data?.available_period
    ? `${data.metric_label} is published as a single district release. Switch the period to ${periodLabel(
        data.available_period,
      )} to see it on the map.`
    : "Yield is a crop-specific measure. Pick a crop in the filters above, then choose the Yield metric.";
  const benchmarkStrategy = data?.provenance?.benchmark_strategy ?? null;
  const benchmarkAffectsLayer = metric === "gap" || metric === "priority";

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={
          data
            ? `${data.metric_label} · ${data.crop ?? "all crops"} · ${periodLabel(
                data.period_code ?? data.period,
              )}`
            : "Loading map metric…"
        }
        action={<UpdatingPill active={isFetching && Boolean(data)} />}
      />
      <div className="px-4 pt-3">
        <MapControls
          metric={metric}
          onMetric={onMetricChange}
          showLabels={showLabels}
          onToggleLabels={setLabelOverride}
          showFacilities={showProgramDistricts && showFacilities}
          onToggleFacilities={setShowFacilities}
          showProgramDistricts={showProgramDistricts}
          cropSelected={Boolean(data?.crop)}
        />
        <details className="mt-2 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            Layer notes
          </summary>
          <p className="mt-1">
            {METRIC_SEMANTICS[metric].note}. Hatched districts have a yield gap of at least{" "}
            {SHORTFALL_GAP}% against this crop&apos;s benchmark (yield-shortfall overlay).
          </p>
          {benchmarkStrategy ? (
            <p className="mt-1 leading-relaxed">
              <span className="font-semibold text-slate-600">Benchmark:</span>{" "}
              {benchmarkAffectsLayer
                ? `${benchmarkLabel(benchmarkStrategy)} is applied to this layer.`
                : `This ${METRIC_SEMANTICS[metric].note.toLowerCase()} layer is observed data; changing the benchmark will affect the Productivity gap and Intervention priority layers, not this value.`}
            </p>
          ) : null}
          {data?.components_unavailable?.length ? (
            <p className="mt-1 leading-relaxed">
              <span className="font-semibold text-amber-800">Not in this score:</span>{" "}
              {unavailableSummary(data.components_unavailable)}
              {data.available_period
                ? ` ${periodLabel(data.available_period)} carries them — select that period to include them.`
                : ""}
            </p>
          ) : null}
        </details>
      </div>

      {blocked ? (
        <div className="px-4 pb-4 pt-2">
          <EmptyState
            title={data?.message ?? "No verified data for this selection."}
            hint={blockedHint}
          />
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "relative mx-auto mt-2 w-full max-w-[820px] px-2",
          blocked && "hidden",
        )}
        style={{ minHeight: height * 0.55 }}
      >
        <DistrictChoropleth
          features={collection.features}
          project={project}
          width={VIEW_W}
          height={VIEW_H}
          colorFor={colorFor}
          labelFor={labelFor}
          selected={selectedDistrict}
          showLabels={showLabels}
          onHover={(feature, event) => {
            const rect = containerRef.current?.getBoundingClientRect();
            setHovered({
              feature,
              x: event.clientX - (rect?.left ?? 0),
              y: event.clientY - (rect?.top ?? 0),
            });
          }}
          onLeave={() => setHovered(null)}
          onSelect={(d) => onSelectDistrict?.(d)}
        >
          <YieldShortfallLayer
            features={collection.features}
            project={project}
            highlighted={shortfall}
          />
          {showProgramDistricts && showFacilities ? (
            <FacilityDistrictMarkers features={collection.features} project={project} facilities={facilities} />
          ) : null}
        </DistrictChoropleth>

        {hovered ? (
          <MapTooltip
            district={hovered.feature.properties.district}
            datum={datumByDistrict.get(hovered.feature.properties.district_code)}
            facility={showProgramDistricts && showFacilities ? facilityByDistrict.get(hovered.feature.properties.district_code) : undefined}
            metricLabel={data?.metric_label ?? metric}
            unit={data?.unit ?? null}
            crop={data?.crop ?? null}
            x={hovered.x}
            y={hovered.y}
          />
        ) : null}
      </div>

      <MapLegend
        scale={scale}
        unit={data?.unit ?? null}
        higherIs={METRIC_SEMANTICS[metric].higherIs}
        direction={METRIC_SEMANTICS[metric].direction}
        // Distinguishes "nothing published for this district" from "this layer is
        // not published for the selected period" - the second case has a release
        // that does carry it, named just above the legend.
        noDataLabel={
          data?.available_period ? "Not published for this period" : "No verified observation"
        }
        overlay={shortfall.size ? `Yield gap ≥ ${SHORTFALL_GAP}%` : null}
        note={data?.crop ? `Crop: ${data.crop}` : "All crops"}
      />

      {data?.provenance ? (
        <SourceNote>
          Source: {data.provenance.source_id ?? "NISR"} · {periodLabel(data.provenance.source_period)} ·
          benchmark: {data.provenance.benchmark_strategy ?? "—"}. Boundaries: geoBoundaries RWA ADM2
          (open, CC-BY). {data.provenance.limitations?.[0] ?? ""}
        </SourceNote>
      ) : null}

      {showProgramDistricts && showFacilities ? (
        <div className="border-t border-forest/10 px-4 py-3">
          <FacilityLayer facilities={facilities} />
        </div>
      ) : null}
    </Card>
  );
}
