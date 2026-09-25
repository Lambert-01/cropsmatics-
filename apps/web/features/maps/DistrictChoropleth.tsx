"use client";

import type { KeyboardEvent, ReactNode } from "react";

import { featureCentroid, featureToPath, type GeoFeature, type Project } from "@/features/maps/geo";

export interface ChoroplethDatum {
  value: number | null;
  label?: string;
}

export function DistrictChoropleth({
  features,
  project,
  width,
  height,
  colorFor,
  labelFor,
  onHover,
  onSelect,
  onLeave,
  selected,
  showLabels = false,
  children,
}: {
  features: GeoFeature[];
  project: Project;
  width: number;
  height: number;
  colorFor: (district: string) => string;
  labelFor: (district: string) => string;
  onHover: (feature: GeoFeature, event: React.MouseEvent) => void;
  onSelect: (district: string) => void;
  onLeave: () => void;
  selected?: string | null;
  showLabels?: boolean;
  children?: ReactNode;
}) {
  const handleKey = (e: KeyboardEvent<SVGPathElement>, district: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(district);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Rwanda district choropleth map"
      className="h-auto w-full touch-none"
    >
      <g>
        {features.map((feature) => {
          const district = feature.properties.district;
          const districtCode = feature.properties.district_code;
          const isSelected = selected === district;
          return (
            <path
              key={feature.properties.district_code}
              d={featureToPath(feature, project)}
              className="map-district cursor-pointer"
              fill={colorFor(districtCode)}
              stroke={isSelected ? "#032D23" : "#ffffff"}
              strokeWidth={isSelected ? 2 : 0.7}
              tabIndex={0}
              role="button"
              aria-label={`${district}: ${labelFor(districtCode)}`}
              onMouseMove={(e) => onHover(feature, e)}
              onMouseLeave={onLeave}
              onFocus={(e) => onHover(feature, e as unknown as React.MouseEvent)}
              onBlur={onLeave}
              onClick={() => onSelect(district)}
              onKeyDown={(e) => handleKey(e, district)}
            />
          );
        })}
      </g>
      {children}
      {showLabels ? (
        <g aria-hidden="true" className="pointer-events-none">
          {features.map((feature) => {
            const [x, y] = featureCentroid(feature, project);
            return (
              <text
                key={`label-${feature.properties.district_code}`}
                x={x}
                y={y}
                textAnchor="middle"
                className="fill-forest-deep text-[7px] font-medium"
              >
                {feature.properties.district}
              </text>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
