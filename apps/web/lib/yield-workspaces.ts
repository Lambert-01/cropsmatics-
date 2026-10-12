/**
 * Yield Intelligence workspaces.
 *
 * The page used to be one long scroll: trend, map, ranking, gap distribution,
 * drivers, model cards and the AI panel stacked on top of each other, so a
 * reader had to scroll past four analyses to reach the fifth. These are the
 * focused workspaces it is split into.
 *
 * Every workspace below renders something real. The Data & Models policy of
 * "no empty sections" applies here too: a workspace that had nothing behind it
 * would not be listed. Two things the brief asked for are deliberately absent
 * because no such data exists yet - a map `change` layer and an indexed trend -
 * and faking them would be exactly the invented-precision failure the platform
 * avoids elsewhere.
 */

export interface YieldWorkspace {
  id: string;
  label: string;
  /** One line telling the reader what question this workspace answers. */
  description: string;
}

export const YIELD_WORKSPACES: readonly YieldWorkspace[] = [
  {
    id: "overview",
    label: "Overview",
    description: "The four headline numbers, and the districts behind them.",
  },
  {
    id: "trends",
    label: "Trends",
    description: "Same-season change across published periods, never A → B → C.",
  },
  {
    id: "spatial",
    label: "Spatial",
    description: "Where the yield sits, and one district in detail.",
  },
  {
    id: "gaps",
    label: "Gaps",
    description: "How the shortfall against the benchmark is distributed.",
  },
  {
    id: "drivers",
    label: "Drivers",
    description: "Factors associated with yield — association, not cause.",
  },
  {
    id: "scenarios",
    label: "Scenarios",
    description: "Recalculate the ranking under stated assumptions.",
  },
  {
    id: "forecast",
    label: "Forecast",
    description: "Whether a next-season forecast is validated — and why not when it is not.",
  },
  {
    id: "ai",
    label: "AI Analyst",
    description: "A grounded explanation of the current selection.",
  },
  {
    id: "methodology",
    label: "Methodology",
    description: "What is observed, what is modelled, and where it comes from.",
  },
] as const;

export const DEFAULT_YIELD_WORKSPACE = "overview";

/** A workspace id from a URL, falling back rather than rendering nothing. */
export function resolveWorkspace(id: string | null | undefined): string {
  const known = YIELD_WORKSPACES.some((workspace) => workspace.id === id);
  return known && id ? id : DEFAULT_YIELD_WORKSPACE;
}
