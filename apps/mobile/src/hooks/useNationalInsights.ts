/**
 * Derived national insights, from the real published data.
 *
 * One hook so the Home "Latest insight" and the Insights feed cannot disagree:
 * both read the same national board, the same input-adoption trend and the same
 * post-harvest summary, and both apply the identical deterministic rules. Every
 * sentence is assembled from an API value — nothing is invented, and a metric
 * with no published comparison produces an explicit "none published" line
 * rather than a fabricated one.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { strings } from "../i18n";
import { analyticsApi, postHarvestApi } from "../services/api";
import { useAppStore } from "../store/useAppStore";
import { computeMovers } from "../utils/movers";
import { fillTemplate } from "../utils/templates";
import { useNationalBoard } from "./queries";

/** Only these icon names occur, so no icon-set import is needed here. */
export type InsightIcon =
  | "trending-up-outline"
  | "trending-down-outline"
  | "flask-outline"
  | "cube-outline";

export interface NationalInsight {
  id: "mover" | "adoption" | "loss";
  icon: InsightIcon;
  title: string;
  detail: string;
}

/** National practices, in the input-adoption response's own keys. */
const ADOPTION_PRACTICES = [
  { key: "improved_seed_pct", labelKey: "improvedSeed" },
  { key: "inorganic_fertilizer_pct", labelKey: "inorganicFertilizer" },
  { key: "organic_fertilizer_pct", labelKey: "organicFertilizer" },
  { key: "pesticide_pct", labelKey: "pesticide" },
  { key: "irrigation_pct", labelKey: "irrigation" },
  { key: "anti_erosion_pct", labelKey: "erosionProtection" },
] as const;

export function useNationalInsights(): { insights: NationalInsight[]; isLoading: boolean } {
  const t = strings(useAppStore((state) => state.language));
  const board = useNationalBoard();
  const adoption = useQuery({ queryKey: ["input-adoption"], queryFn: analyticsApi.inputAdoption });
  const postHarvest = useQuery({
    queryKey: ["postharvest-national"],
    queryFn: () => postHarvestApi.summary(),
  });

  const insights = useMemo(() => {
    const list: NationalInsight[] = [];

    // --- largest same-season production mover --------------------------------
    const { growing, falling } = computeMovers(board.data?.crops, "production_mt", 1);
    const up = growing[0];
    const down = falling[0];
    const mover =
      up && (!down || Math.abs(up.change.changePct) >= Math.abs(down.change.changePct))
        ? { direction: "up" as const, item: up }
        : down
          ? { direction: "down" as const, item: down }
          : null;

    list.push({
      id: "mover",
      icon: mover?.direction === "down" ? "trending-down-outline" : "trending-up-outline",
      title: t.moversTitle,
      detail: mover
        ? fillTemplate(mover.direction === "up" ? t.insightProduceRising : t.insightProduceFalling, {
            crop: mover.item.crop,
            pct: Math.abs(mover.item.change.changePct).toFixed(1),
            prev: mover.item.change.previous.label,
          })
        : t.insightNoMover,
    });

    // --- latest published practice adoption ----------------------------------
    const points = adoption.data?.points ?? [];
    let adoptionInsight: { label: string; value: number; period: string } | null = null;
    for (let index = points.length - 1; index >= 0 && !adoptionInsight; index -= 1) {
      const point = points[index];
      const practice = ADOPTION_PRACTICES.find((item) => point.values?.[item.key] != null);
      if (practice) {
        adoptionInsight = {
          label: t[practice.labelKey],
          value: point.values[practice.key] as number,
          period: point.label ?? point.period,
        };
      }
    }
    if (adoptionInsight) {
      list.push({
        id: "adoption",
        icon: "flask-outline",
        title: t.inputAdoptionTitle,
        detail: fillTemplate(t.insightAdoption, {
          practice: adoptionInsight.label,
          value: adoptionInsight.value.toFixed(1),
          period: adoptionInsight.period,
        }),
      });
    }

    // --- post-harvest loss, only when the API publishes a loss KPI -----------
    const lossKpi = (postHarvest.data?.kpis ?? []).find(
      (item) => item.id.includes("loss") && item.value !== null && item.value !== undefined,
    );
    if (lossKpi) {
      list.push({
        id: "loss",
        icon: "cube-outline",
        title: t.losses,
        detail: fillTemplate(t.insightLoss, {
          value: (lossKpi.value as number).toFixed(1),
          period: lossKpi.period ?? "—",
        }),
      });
    }

    return list;
  }, [board.data, adoption.data, postHarvest.data, t]);

  return { insights, isLoading: board.isLoading || adoption.isLoading };
}
