import { useMemo } from "react";
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import { useTheme } from "../theme/theme-context";
import type { MapTransform } from "../utils/mapTransform";

type Ring = number[][];

type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

interface Feature {
  properties: { district: string; district_code: string; province?: string };
  geometry: Geometry;
}

const GEOJSON = require("../../assets/geodata/rwanda_districts.json") as {
  features: Feature[];
};

/** Normalize Polygon and MultiPolygon to a flat list of rings. */
function ringsOf(geometry: Geometry): Ring[] {
  if (geometry.type === "Polygon") return geometry.coordinates as Ring[];
  return (geometry.coordinates as Ring[][]).flat();
}

interface Projected {
  code: string;
  name: string;
  d: string;
  centroid: { x: number; y: number };
}

/**
 * Project the GeoJSON into SVG path strings **once** (memoized at module load).
 * Reparsing the geometry on every render would make the map janky on cheap
 * Android devices, so this is deliberately computed outside the component.
 */
function buildProjected(width: number, height: number): Projected[] {
  const all: number[][] = [];
  for (const feature of GEOJSON.features) {
    for (const ring of ringsOf(feature.geometry)) for (const point of ring) all.push(point);
  }
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const pad = 6;
  const scaleX = (width - pad * 2) / (maxLon - minLon || 1);
  const scaleY = (height - pad * 2) / (maxLat - minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (width - (maxLon - minLon) * scale) / 2;
  const offsetY = (height - (maxLat - minLat) * scale) / 2;

  const project = (lon: number, lat: number) => ({
    x: (lon - minLon) * scale + offsetX,
    // Latitude increases northward; SVG y increases downward.
    y: height - ((lat - minLat) * scale + offsetY),
  });

  return GEOJSON.features.map((feature) => {
    let d = "";
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const ring of ringsOf(feature.geometry)) {
      ring.forEach((point, index) => {
        const { x, y } = project(point[0], point[1]);
        d += `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        cx += x;
        cy += y;
        n += 1;
      });
      d += "Z";
    }
    return {
      code: feature.properties.district_code,
      name: feature.properties.district,
      d,
      centroid: { x: cx / Math.max(n, 1), y: cy / Math.max(n, 1) },
    };
  });
}

export interface MapValue {
  value: number | null;
  color: string;
}

export function RwandaMap({
  width,
  height = 360,
  values,
  selected,
  onSelect,
  transform,
}: {
  width: number;
  height?: number;
  /** district_code -> resolved value/color. Districts absent are "no data". */
  values: Record<string, MapValue>;
  selected?: string | null;
  onSelect?: (code: string, name: string) => void;
  /**
   * Applied zoom/pan. Scaling happens about the container centre, so the offset
   * limit that keeps the map covering the viewport is `(scale - 1) * size / 2` -
   * which is exactly what `clampTransform` enforces.
   */
  transform?: MapTransform;
}) {
  const { colors } = useTheme();
  const projected = useMemo(() => buildProjected(width, height), [width, height]);
  const applied = transform ?? { scale: 1, x: 0, y: 0 };

  return (
    // Overflow is hidden here, not on the transform wrapper: the zoomed geometry
    // must be clipped to the map frame rather than escaping into the screen.
    <View style={{ width, height, overflow: "hidden" }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Rwanda district map. ${Object.values(values)
          .filter((v) => v.value !== null)
          .length} districts have data for the selected indicator.`}
        style={{
          width,
          height,
          transform: [
            { translateX: applied.x },
            { translateY: applied.y },
            { scale: applied.scale },
          ],
        }}
      >
        <Svg width={width} height={height}>
          <G>
            {projected.map((shape) => {
              const entry = values[shape.code];
              const isSelected = selected === shape.code;
              return (
                <Path
                  key={shape.code}
                  d={shape.d}
                  fill={entry?.color ?? colors.slate300}
                  stroke={isSelected ? colors.forestDeep : colors.surface}
                  // The outline thickens with the zoom so a selected district stays
                  // legible, and thins in screen terms as it shrinks back.
                  strokeWidth={(isSelected ? 2 : 1) / applied.scale}
                  onPress={onSelect ? () => onSelect(shape.code, shape.name) : undefined}
                />
              );
            })}
          </G>
        </Svg>
      </View>
    </View>
  );
}
