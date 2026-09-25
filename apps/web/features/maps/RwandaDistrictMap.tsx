"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardHeader, SourceNote } from "@/components/ui/Card";
import { MapSkeleton } from "@/components/ui/States";
import { makeScale } from "@/features/maps/colors";
import { DistrictChoropleth } from "@/features/maps/DistrictChoropleth";
import { FacilityDistrictMarkers, FacilityLayer } from "@/features/maps/FacilityLayer";
import { HarvestPressureLayer } from "@/features/maps/HarvestPressureLayer";
import { MapControls } from "@/features/maps/MapControls";
import { MapLegend } from "@/features/maps/MapLegend";
import { MapTooltip } from "@/features/maps/MapTooltip";
import { buildProjection, type GeoCollection, type GeoFeature } from "@/features/maps/geo";
import { METRIC_SEMANTICS, type MapMetricId } from "@/lib/constants";
import { periodLabel } from "@/lib/format";
import type { FacilityItem, MapMetricsResponse } from "@/types";

const VIEW_W = 1000;
const VIEW_H = 880;
const PRESSURE_GAP = 20; // % below benchmark -> hatched "harvest pressure" overlay

export function RwandaDistrictMap({
  data,
  metric,
  onMetricChange,
  onSelectDistrict,
  selectedDistrict,
  facilities = [],
  height = 460,
  title = "Rwanda Productivity & Risk Map",
}: {
  data?: MapMetricsResponse;
  metric: MapMetricId;
  onMetricChange: (metric: MapMetricId) => void;
  onSelectDistrict?: (district: string) => void;
  selectedDistrict?: string | null;
  facilities?: FacilityItem[];
  height?: number;
  title?: string;
}) {
  const [collection, setCollection] = useState<GeoCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showFacilities, setShowFacilities] = useState(false);
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

  const scale = useMemo(
    () =>
      makeScale(
        data?.min_value ?? 0,
        data?.max_value ?? 1,
        METRIC_SEMANTICS[metric].higherIs,
      ),
    [data, metric],
  );

  const pressure = useMemo(() => {
    const set = new Set<string>();
    (data?.districts ?? []).forEach((d) => {
      const gap = d.details?.gap_index;
      if (d.district_code && typeof gap === "number" && gap >= PRESSURE_GAP) set.add(d.district_code);
    });
    return set;
  }, [data]);

  const colorFor = (districtCode: string) => {
    const datum = datumByDistrict.get(districtCode);
    return scale.color(datum?.value ?? null);
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

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={
          data
            ? `${data.metric_label} · ${data.crop ?? "all crops"} · ${periodLabel(data.period)}`
            : "Loading map metric…"
        }
      />
      <div className="px-4 pt-3">
        <MapControls
          metric={metric}
          onMetric={onMetricChange}
          showLabels={showLabels}
          onToggleLabels={setShowLabels}
          showFacilities={showFacilities}
          onToggleFacilities={setShowFacilities}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          {METRIC_SEMANTICS[metric].note}. Hatched districts have a productivity gap of at least{" "}
          {PRESSURE_GAP}% (harvest-pressure overlay).
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto mt-2 w-full max-w-[820px] px-2"
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
          <HarvestPressureLayer
            features={collection.features}
            project={project}
            highlighted={pressure}
          />
          {showFacilities ? (
            <FacilityDistrictMarkers features={collection.features} project={project} facilities={facilities} />
          ) : null}
        </DistrictChoropleth>

        {hovered ? (
          <MapTooltip
            district={hovered.feature.properties.district}
            datum={datumByDistrict.get(hovered.feature.properties.district_code)}
            facility={showFacilities ? facilityByDistrict.get(hovered.feature.properties.district_code) : undefined}
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
        note={data?.crop ? `Crop: ${data.crop}` : "All crops"}
      />

      {data?.provenance ? (
        <SourceNote>
          Source: {data.provenance.source_id ?? "NISR"} · {periodLabel(data.provenance.source_period)} ·
          benchmark: {data.provenance.benchmark_strategy ?? "—"}. Boundaries: geoBoundaries RWA ADM2
          (open, CC-BY). {data.provenance.limitations?.[0] ?? ""}
        </SourceNote>
      ) : null}

      {showFacilities ? (
        <div className="border-t border-forest/10 px-4 py-3">
          <FacilityLayer facilities={facilities} />
        </div>
      ) : null}
    </Card>
  );
}
