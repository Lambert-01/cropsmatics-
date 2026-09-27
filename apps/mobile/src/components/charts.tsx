import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { colors, radius, spacing, typography } from "../theme";
import { EmptyState } from "./ui";

const CHART_HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 26, left: 40 };

export interface SeriesPoint {
  label: string;
  value: number | null;
}

function bounds(values: SeriesPoint[]) {
  const nums = values.map((p) => p.value).filter((v): v is number => v !== null);
  if (!nums.length) return { min: 0, max: 1 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: max === min ? max + 1 : max };
}

function summary(values: SeriesPoint[], unit: string): string {
  const parts = values
    .filter((p) => p.value !== null)
    .map((p) => `${p.label} ${p.value}${unit ? ` ${unit}` : ""}`);
  return parts.length ? parts.join(", ") : "No data";
}

export function LineChart({
  values,
  unit = "",
  width = 320,
}: {
  values: SeriesPoint[];
  unit?: string;
  width?: number;
}) {
  if (!values.length) return <EmptyState title="No trend data available." icon="trending-up-outline" />;
  const { min, max } = bounds(values);
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const x = (i: number) => PADDING.left + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
  const y = (v: number) => PADDING.top + innerH - ((v - min) / (max - min)) * innerH;

  const path = values
    .map((p, i) => (p.value === null ? null : `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Line chart. ${summary(values, unit)}`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.md }}
    >
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={PADDING.left}
          y1={PADDING.top + innerH}
          x2={width - PADDING.right}
          y2={PADDING.top + innerH}
          stroke={colors.border}
        />
        <SvgText x={4} y={PADDING.top + 8} fontSize={9} fill={colors.slate500}>
          {`${Math.round(max)}`}
        </SvgText>
        <SvgText x={4} y={PADDING.top + innerH} fontSize={9} fill={colors.slate500}>
          {`${Math.round(min)}`}
        </SvgText>
        {path ? <Path d={path} stroke={colors.primary} strokeWidth={2.5} fill="none" /> : null}
        {values.map((p, i) =>
          p.value === null ? null : (
            <Circle key={p.label} cx={x(i)} cy={y(p.value)} r={3.5} fill={colors.primary} />
          ),
        )}
        {values.map((p, i) => (
          <SvgText key={`l-${p.label}`} x={x(i)} y={CHART_HEIGHT - 8} fontSize={9} fill={colors.slate500} textAnchor="middle">
            {p.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export function BarChart({
  values,
  unit = "",
  width = 320,
}: {
  values: SeriesPoint[];
  unit?: string;
  width?: number;
}) {
  if (!values.length) return <EmptyState title="No data available." icon="bar-chart-outline" />;
  const { max } = bounds(values);
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const slot = innerW / values.length;
  const barW = Math.max(8, Math.min(38, slot * 0.55));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Bar chart. ${summary(values, unit)}`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.md }}
    >
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={PADDING.left}
          y1={PADDING.top + innerH}
          x2={width - PADDING.right}
          y2={PADDING.top + innerH}
          stroke={colors.border}
        />
        {values.map((p, i) => {
          const h = p.value === null ? 0 : (p.value / max) * innerH;
          const cx = PADDING.left + slot * i + slot / 2;
          return (
            <G key={p.label}>
              <Rect
                x={cx - barW / 2}
                y={PADDING.top + innerH - h}
                width={barW}
                height={Math.max(h, 1)}
                rx={4}
                fill={colors.primary}
              />
              <SvgText x={cx} y={CHART_HEIGHT - 8} fontSize={9} fill={colors.slate500} textAnchor="middle">
                {p.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function HorizontalBarChart({
  values,
  unit = "",
  maxItems = 8,
}: {
  values: SeriesPoint[];
  unit?: string;
  maxItems?: number;
}) {
  const rows = values.slice(0, maxItems);
  if (!rows.length) return <EmptyState title="No data available." icon="stats-chart-outline" />;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Horizontal bar chart. ${summary(rows, unit)}`}
      style={{ gap: spacing.sm }}
    >
      {rows.map((row) => {
        const pct = row.value === null ? 0 : Math.max(2, (row.value / max) * 100);
        return (
          <View key={row.label} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text numberOfLines={1} style={{ ...typography.caption, flex: 1 }}>
                {row.label}
              </Text>
              <Text style={styles.barValue}>
                {row.value === null ? "—" : `${row.value.toLocaleString()}${unit ? ` ${unit}` : ""}`}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface DonutSlice {
  label: string;
  value: number | null;
  color: string;
}

export function DonutChart({ slices, unit = "%" }: { slices: DonutSlice[]; unit?: string }) {
  const real = slices.filter((s) => (s.value ?? 0) > 0);
  const total = real.reduce((sum, s) => sum + (s.value ?? 0), 0);
  if (!real.length || total <= 0) {
    return <EmptyState title="No composition data available." icon="pie-chart-outline" />;
  }

  const size = 160;
  const stroke = 26;
  const radiusPx = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  let offset = 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Composition chart. ${real
        .map((s) => `${s.label} ${s.value}${unit}`)
        .join(", ")}`}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {real.map((slice) => {
            const fraction = (slice.value ?? 0) / total;
            const dash = fraction * circumference;
            const el = (
              <Circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radiusPx}
                stroke={slice.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </G>
      </Svg>
      <View style={{ flex: 1, gap: 5 }}>
        {real.map((slice) => (
          <View key={slice.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: slice.color }} />
            <Text style={{ ...typography.caption, flex: 1 }} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.barValue}>
              {(slice.value ?? 0).toFixed(1)}
              {unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = {
  barTrack: { height: 8, borderRadius: 999, backgroundColor: colors.mintSoft, overflow: "hidden" as const },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  barValue: { fontSize: 12, fontWeight: "700" as const, color: colors.forestDeep },
};
