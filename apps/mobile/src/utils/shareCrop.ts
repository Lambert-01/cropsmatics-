/**
 * Text composed for the Crop Terminal's share action.
 *
 * Deliberately pure and narrow: it only ever includes identity (crop name),
 * published axis bounds, the latest published figure and the published source.
 * It never estimates, never rounds beyond `formatValue`, and drops any line
 * whose input is missing — a share can be empty of numbers and still be honest,
 * but it can never contain a number the API did not publish.
 */

import { formatValue } from "./analytics";

export interface CropShareText {
  heading: string;
  series: string;
  metric: string;
  source: string;
  note: string;
}

export interface CropShareInput {
  crop: string;
  /** The published national axis, oldest first. */
  periods: readonly string[];
  metricLabel: string;
  /** Latest published value for the current metric, or null when unpublished. */
  value: number | null;
  unit: string | null;
  /** The published period the value belongs to. */
  valuePeriod: string | null;
  source: string | null;
  t: CropShareText;
}

export function buildCropShareText(input: CropShareInput): string {
  const lines: string[] = [input.t.heading.replace("{crop}", input.crop)];
  if (input.periods.length) {
    lines.push(
      input.t.series
        .replace("{first}", input.periods[0])
        .replace("{last}", input.periods[input.periods.length - 1]),
    );
  }
  if (input.value !== null && Number.isFinite(input.value)) {
    lines.push(
      input.t.metric
        .replace("{metric}", input.metricLabel)
        .replace("{value}", formatValue(input.value))
        .replace("{unit}", input.unit ? ` ${input.unit}` : "")
        .replace("{period}", input.valuePeriod ?? ""),
    );
  }
  if (input.source) {
    lines.push(input.t.source.replace("{source}", input.source));
  }
  lines.push(input.t.note);
  return lines.join("\n");
}
