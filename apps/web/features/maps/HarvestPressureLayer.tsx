import { featureToPath, type GeoFeature, type Project } from "@/features/maps/geo";

/**
 * Harvest-pressure overlay: a hatched highlight on districts whose selected value
 * crosses the pressure threshold. It is an overlay on the choropleth, never a
 * replacement for the metric legend.
 */
export function HarvestPressureLayer({
  features,
  project,
  highlighted,
  patternId = "harvest-pressure",
}: {
  features: GeoFeature[];
  project: Project;
  highlighted: Set<string>;
  patternId?: string;
}) {
  const targets = features.filter((f) => highlighted.has(f.properties.district_code));
  if (!targets.length) return null;

  return (
    <>
      <defs>
        <pattern id={patternId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#032D23" strokeWidth="2.2" opacity="0.5" />
        </pattern>
      </defs>
      <g aria-hidden="true" className="pointer-events-none">
        {targets.map((f) => (
          <path
            key={`pressure-${f.properties.district_code}`}
            d={featureToPath(f, project)}
            fill={`url(#${patternId})`}
          />
        ))}
      </g>
    </>
  );
}
