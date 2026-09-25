import type { DistrictFeatureProperties } from "@/types";

export interface GeoFeature {
  type: "Feature";
  properties: DistrictFeatureProperties;
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

export type Project = (lon: number, lat: number) => [number, number];

/**
 * Equirectangular projection fitted to the data bounds. Rwanda sits close to the
 * equator, so the distortion is negligible and we avoid pulling in a projection
 * library for a single small country.
 */
export function buildProjection(
  features: GeoFeature[],
  width: number,
  height: number,
  padding = 12,
): Project {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [lon, lat] = coords as number[];
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    if (Array.isArray(coords)) coords.forEach(visit);
  };

  features.forEach((f) => visit(f.geometry.coordinates));

  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  const scale = Math.min((width - 2 * padding) / lonSpan, (height - 2 * padding) / latSpan);
  const offsetX = (width - lonSpan * scale) / 2;
  const offsetY = (height - latSpan * scale) / 2;

  return (lon: number, lat: number) => [
    offsetX + (lon - minLon) * scale,
    // SVG y grows downward; latitude grows upward.
    offsetY + (maxLat - lat) * scale,
  ];
}

function ringPath(ring: number[][], project: Project): string {
  return (
    ring
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}

export function featureToPath(feature: GeoFeature, project: Project): string {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates.map((ring) => ringPath(ring, project)).join(" ");
  }
  return feature.geometry.coordinates
    .map((polygon) => polygon.map((ring) => ringPath(ring, project)).join(" "))
    .join(" ");
}

/** Centroid of the largest ring — used to place a label. */
export function featureCentroid(feature: GeoFeature, project: Project): [number, number] {
  const rings =
    feature.geometry.type === "Polygon"
      ? feature.geometry.coordinates
      : feature.geometry.coordinates[0];
  const ring = rings[0] ?? [];
  if (ring.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  ring.forEach(([lon, lat]) => {
    const p = project(lon, lat);
    x += p[0];
    y += p[1];
  });
  return [x / ring.length, y / ring.length];
}
