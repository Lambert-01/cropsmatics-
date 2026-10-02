/**
 * Crop movers — the strongest same-season rises and falls on the national board.
 *
 * Pure and platform-free so it can be unit tested. A crop with no comparable
 * earlier published period is excluded rather than treated as a 0 % change, so
 * the movers never contain a crop that did not actually move.
 */

import type { NationalBoardCrop } from "../types";
import { changeFromApi, type ChangeResult } from "./analytics";

export interface CropMover {
  crop: string;
  change: NonNullable<ChangeResult>;
}

export function computeMovers(
  crops: readonly NationalBoardCrop[] | undefined,
  metric: string,
  limit = 3,
): { growing: CropMover[]; falling: CropMover[] } {
  const withChange = (crops ?? [])
    .map((crop) => ({ crop: crop.crop, change: changeFromApi(crop.changes?.[metric]) }))
    .filter((item): item is CropMover => item.change !== null);

  return {
    growing: [...withChange].sort((a, b) => b.change.changePct - a.change.changePct).slice(0, limit),
    falling: [...withChange].sort((a, b) => a.change.changePct - b.change.changePct).slice(0, limit),
  };
}
