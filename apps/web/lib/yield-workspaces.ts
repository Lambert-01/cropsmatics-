/**
 * Yield Intelligence workspaces.
 *
 * The page used to be one long scroll: trend, map, ranking, gap distribution,
 * drivers, model cards and the AI panel stacked on top of each other, so a reader
 * had to scroll past four analyses to reach the fifth. It was then split into nine
 * workspaces, which fixed the scrolling and created a new problem - a tab strip of
 * nine is a menu, not a decision path, and several tabs answered the same question
 * from different angles.
 *
 * There are four now, one per decision:
 *
 *   1. Summary  - where does this crop stand, and how big is the shortfall?
 *   2. Trends   - how has it moved, and where is the detailed gap view?
 *   3. Map      - which districts, side by side with the ranking?
 *   4. Planning - what would follow from my assumptions, and is a validated
 *                 forecast published?
 *
 * Three deliberate placements, because they were competing destinations before:
 *
 * * **Practice associations** are an expandable section on Summary (the full
 *   analysis also lives on Productivity), not a top-level tab. A correlation is
 *   context for the shortfall, not a destination of its own.
 * * **The AI explanation** is a contextual *Explain this selection* action carrying
 *   the current scope, so a reader never has to understand a tab before reading a
 *   chart.
 * * **Model diagnostics and algorithms** are on Data & Models, linked from the
 *   panel they qualify.
 *
 * Nothing was deleted: intervention-weight scenarios stay on Interventions (their
 * purpose is clearer there) and are linked from Planning, rather than being a
 * second copy of the same lab under a yield heading.
 *
 * Every id that ever appeared in a URL keeps working: `LEGACY_WORKSPACE_ALIASES`
 * maps the old names onto the four, so a link someone copied from an older build
 * still opens the content it pointed at.
 */

export interface YieldWorkspace {
  id: string;
  label: string;
  /** One line telling the reader what question this workspace answers. */
  description: string;
}

export const YIELD_WORKSPACES: readonly YieldWorkspace[] = [
  {
    id: "summary",
    label: "Summary",
    description: "Where this crop stands in the selected period, how big the shortfall is, and what it relates to.",
  },
  {
    id: "trends",
    label: "Trends",
    description: "Same-season change across published periods, with the route into the detailed gap view.",
  },
  {
    id: "map",
    label: "Map",
    description: "District geography and the ranking together — click either to open the district's published detail.",
  },
  {
    id: "planning",
    label: "Planning",
    description: "Build a projection from stated assumptions, and see whether a validated forecast is published.",
  },
] as const;

export const DEFAULT_YIELD_WORKSPACE = "summary";

/**
 * Old workspace id -> the workspace that now holds that content.
 *
 * These are not redirects for tidiness: a copied link that silently lost its
 * analysis would be worse than the nine-tab strip ever was.
 */
export const LEGACY_WORKSPACE_ALIASES: Readonly<Record<string, string>> = {
  // The first overview was already the summary.
  overview: "summary",
  // The explanation is an action on Summary now.
  ai: "summary",
  // Practice associations and the shortfall view both sit on Summary.
  drivers: "summary",
  // Provenance and model detail: the model cards moved to Data & Models, and the
  // selected observation's provenance is on Summary.
  methodology: "summary",
  // The gap distribution is the shortfall view on Summary; the detailed
  // persistence route is on Trends.
  gaps: "trends",
  // The map and the ranking are one workspace, as they answer one question.
  spatial: "map",
  // Yield-scenario and manual-projection work is the Planning workspace; the
  // validated-forecast status sits there too.
  forecast: "planning",
  scenarios: "planning",
};

/** Canonical workspace for any id, including a legacy alias. */
export function canonicalWorkspace(id: string | null | undefined): string | null {
  if (!id) return null;
  const mapped = LEGACY_WORKSPACE_ALIASES[id] ?? id;
  return YIELD_WORKSPACES.some((workspace) => workspace.id === mapped) ? mapped : null;
}

/** A workspace id from a URL, falling back rather than rendering nothing. */
export function resolveWorkspace(id: string | null | undefined): string {
  return canonicalWorkspace(id) ?? DEFAULT_YIELD_WORKSPACE;
}
