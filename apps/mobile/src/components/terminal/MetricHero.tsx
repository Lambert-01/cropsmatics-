/**
 * The headline figure of an analytical view: label, value, unit, period.
 *
 * Presentational only. It never fetches and never decides whether a value is
 * "good" — a null stays "Not published" and the caller supplies the change
 * badge, so the number under the headline and the badge beside it always come
 * from the same observation.
 */

import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { useTheme } from "../../theme/theme-context";
import type { ChangeResult } from "../../utils/analytics";
import { formatValue } from "../../utils/analytics";
import { ChangeIndicator } from "../data-view";

export function MetricHero({
  label,
  value,
  unit,
  period,
  note,
  change,
  changeNote,
  compact = false,
}: {
  label: string;
  /** null/undefined render as "Not published" — never as 0. */
  value: number | null | undefined;
  unit?: string | null;
  /** The published period the value belongs to. */
  period?: string | null;
  note?: ReactNode;
  change?: ChangeResult | null;
  changeNote?: string;
  compact?: boolean;
}) {
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const published = value !== null && value !== undefined && Number.isFinite(value);

  return (
    <View style={{ gap: 3 }}>
      <Text style={typography.microCaps}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            ...(compact ? typography.numericLarge : typography.numericLarge),
            fontSize: compact ? 26 : 34,
            color: published ? colors.forestDeep : colors.slate500,
            fontVariant: ["tabular-nums"],
          }}
        >
          {published ? formatValue(value) : t.notPublished}
        </Text>
        {published && unit ? <Text style={typography.unit}>{unit}</Text> : null}
      </View>
      {period ? <Text style={typography.micro}>{period}</Text> : null}
      {change ? <ChangeIndicator change={change} /> : changeNote ? <Text style={typography.micro}>{changeNote}</Text> : null}
      {note}
    </View>
  );
}
