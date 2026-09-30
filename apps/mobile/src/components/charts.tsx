/**
 * Chart engine for the data workspace.
 *
 * Design rules baked into this module:
 *
 * - **Width is measured, never assumed.** The previous implementation defaulted
 *   to a fixed 320 px, which clipped or stretched on every real phone. Charts
 *   measure their container with `onLayout`; an explicit `width` is still
 *   accepted for tests and for a caller that already knows its slot.
 * - **A missing period is a break, not a zero.** Line geometry is built from
 *   `seriesSegments`, so a gap in the published data shows as a gap.
 * - **Interaction is operable and announced.** Dragging the plot moves a
 *   crosshair, and the same selection can be moved with a screen reader's
 *   increment/decrement action; the readout is the accessible value.
 * - **Colour is never the only encoding.** Every series carries a label, a
 *   swatch and its number in the readout, which doubles as the legend.
 */

import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { chart, colors, radius, seriesColor, spacing, typography } from "../theme";
import type { SeriesPoint } from "../utils/analytics";
import {
  formatValue,
  nearestIndex,
  niceTicks,
  publishedCount,
  seriesSegments,
  thinLabels,
  yDomain,
} from "../utils/analytics";
import { EmptyState } from "./ui";

export type { SeriesPoint } from "../utils/analytics";

/** One plotted series. Points are index-aligned with the first series. */
export interface ChartSeries {
  key: string;
  label: string;
  /** Overrides the positional palette entry; useful for a fixed semantic colour. */
  color?: string;
  points: SeriesPoint[];
}

interface PreparedSeries extends ChartSeries {
  color: string;
}

function prepare(series: ChartSeries[]): PreparedSeries[] {
  return series.map((item, index) => ({ ...item, color: item.color ?? seriesColor(index) }));
}

function measureWidth(event: LayoutChangeEvent, current: number, set: (value: number) => void) {
  const next = Math.round(event.nativeEvent.layout.width);
  if (next > 0 && next !== current) set(next);
}

/** The latest period that published at least one value across the series. */
function lastPublishedIndex(series: PreparedSeries[], count: number): number {
  for (let index = count - 1; index >= 0; index -= 1) {
    if (series.some((item) => item.points[index]?.value !== null && item.points[index]?.value !== undefined)) {
      return index;
    }
  }
  return count - 1;
}

/**
 * Period + value readout. This is simultaneously the legend, the crosshair
 * readout and the screen reader's value, so the three can never disagree.
 */
function Readout({
  series,
  index,
  unit,
}: {
  series: PreparedSeries[];
  index: number;
  unit?: string | null;
}) {
  const label = series[0]?.points[index]?.label ?? "—";
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={typography.microCaps}>{String(label).toUpperCase()}</Text>
        {unit ? <Text style={typography.axisLabel}>{unit}</Text> : null}
      </View>
      {series.map((item) => {
        const value = item.points[index]?.value ?? null;
        return (
          <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: item.color }} />
            <Text numberOfLines={1} style={{ ...typography.numericSmall, flex: 1 }}>
              {item.label}
            </Text>
            {value === null ? (
              <Text style={{ ...typography.numericSmall, color: colors.slate500 }}>No data</Text>
            ) : (
              <>
                <Text style={typography.numeric}>{formatValue(value)}</Text>
                {unit ? <Text style={typography.unit}>{unit}</Text> : null}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

export interface TimeSeriesChartProps {
  series: ChartSeries[];
  /** Unit shown next to every value. Never inferred from the metric name. */
  unit?: string | null;
  height?: number;
  /** Explicit width. Omit to measure the container. */
  width?: number;
  /** Selection notifications, e.g. to drive a linked map layer. */
  onSelectIndex?: (index: number | null, label: string | null) => void;
  /** One line of provenance/coverage under the plot. */
  note?: string;
  emptyNote?: string;
  accessibilityLabel?: string;
}

export function TimeSeriesChart({
  series,
  unit,
  height: heightProp,
  width: widthProp,
  onSelectIndex,
  note,
  emptyNote,
  accessibilityLabel,
}: TimeSeriesChartProps) {
  const prepared = prepare(series);
  const [measured, setMeasured] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const height = heightProp ?? chart.height;
  const width = widthProp ?? measured;
  const labels = prepared[0]?.points.map((point) => point.label) ?? [];
  const count = labels.length;

  const domain = yDomain(prepared.flatMap((item) => item.points));
  const ticks = niceTicks(domain.min, domain.max, 4);
  const hasData = prepared.some((item) => publishedCount(item.points) > 0);
  const activeIndex = selected ?? lastPublishedIndex(prepared, count);

  const pad = chart.pad;
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const xAt = (index: number) =>
    pad.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const yAt = (value: number) =>
    pad.top + innerH - ((value - domain.min) / (domain.max - domain.min)) * innerH;

  const xLabels = thinLabels(labels.map(String), Math.max(2, Math.floor(innerW / 62)));
  const showPointMarkers = count <= 10;
  const zeroVisible = domain.min < 0 && domain.max > 0;

  const readoutText =
    count === 0
      ? "No periods published"
      : `${labels[activeIndex] ?? ""}: ${prepared
          .map((item) => {
            const value = item.points[activeIndex]?.value ?? null;
            return `${item.label} ${value === null ? "no data" : `${formatValue(value)}${unit ? ` ${unit}` : ""}`}`;
          })
          .join(", ")}`;

  const select = (event: GestureResponderEvent) => {
    if (count === 0) return;
    const index = nearestIndex(event.nativeEvent.locationX, pad.left, innerW, count);
    setSelected(index);
    onSelectIndex?.(index, labels[index] ?? null);
  };

  const step = (direction: 1 | -1) => {
    if (count === 0) return;
    const next = Math.min(count - 1, Math.max(0, activeIndex + direction));
    setSelected(next);
    onSelectIndex?.(next, labels[next] ?? null);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Readout series={prepared} index={activeIndex} unit={unit} />

      <View
        onLayout={(event) => measureWidth(event, measured, setMeasured)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel ?? "Time series chart"}
        accessibilityValue={{ text: readoutText }}
        accessibilityHint="Swipe up or down to move between published periods."
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") step(1);
          if (event.nativeEvent.actionName === "decrement") step(-1);
        }}
        onStartShouldSetResponder={() => count > 0}
        onMoveShouldSetResponder={() => count > 0}
        onResponderGrant={select}
        onResponderMove={select}
        style={{ alignSelf: "stretch" }}
      >
        {width > 0 && count > 0 && hasData ? (
          <Svg width={width} height={height}>
            {/* Horizontal grid + y tick labels */}
            {ticks.map((tick) => (
              <G key={`y-${tick}`}>
                <Line
                  x1={pad.left}
                  y1={yAt(tick)}
                  x2={width - pad.right}
                  y2={yAt(tick)}
                  stroke={colors.grid}
                  strokeWidth={1}
                />
                <SvgText
                  x={pad.left - 6}
                  y={yAt(tick) + 3}
                  fontSize={10}
                  fill={colors.slate500}
                  textAnchor="end"
                >
                  {formatValue(tick)}
                </SvgText>
              </G>
            ))}

            {zeroVisible ? (
              <Line
                x1={pad.left}
                y1={yAt(0)}
                x2={width - pad.right}
                y2={yAt(0)}
                stroke={colors.axis}
                strokeWidth={1}
              />
            ) : null}

            {/* Baseline */}
            <Line
              x1={pad.left}
              y1={pad.top + innerH}
              x2={width - pad.right}
              y2={pad.top + innerH}
              stroke={colors.border}
              strokeWidth={1}
            />

            {/* Crosshair sits under the series so it never hides a value. */}
            {selected !== null && count > 0 ? (
              <Line
                x1={xAt(activeIndex)}
                y1={pad.top}
                x2={xAt(activeIndex)}
                y2={pad.top + innerH}
                stroke={colors.primary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}

            {prepared.map((item) => {
              const segments = seriesSegments(item.points);
              return (
                <G key={item.key}>
                  {segments.map((segment) =>
                    segment.points.length > 1 ? (
                      <Path
                        key={`${item.key}-${segment.start}`}
                        d={segment.points
                          .map((point, offset) => {
                            const index = segment.start + offset;
                            return `${offset === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value as number)}`;
                          })
                          .join(" ")}
                        stroke={item.color}
                        strokeWidth={chart.strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null,
                  )}
                  {segments.map((segment) =>
                    segment.points.length === 1 ? (
                      <Circle
                        key={`dot-${item.key}-${segment.start}`}
                        cx={xAt(segment.start)}
                        cy={yAt(segment.points[0].value as number)}
                        r={chart.pointRadius}
                        fill={item.color}
                      />
                    ) : null,
                  )}
                  {showPointMarkers
                    ? item.points.map((point, index) =>
                        point.value === null ? null : (
                          <Circle
                            key={`p-${item.key}-${index}`}
                            cx={xAt(index)}
                            cy={yAt(point.value)}
                            r={chart.pointRadius}
                            fill={item.color}
                          />
                        ),
                      )
                    : null}
                  {selected !== null ? (
                    (() => {
                      const value = item.points[activeIndex]?.value ?? null;
                      if (value === null) return null;
                      return (
                        <Circle
                          cx={xAt(activeIndex)}
                          cy={yAt(value)}
                          r={chart.pointRadius + 1.5}
                          fill={colors.surface}
                          stroke={item.color}
                          strokeWidth={2}
                        />
                      );
                    })()
                  ) : null}
                </G>
              );
            })}

            {/* X labels, thinned so they never collide on a narrow phone. */}
            {xLabels.map((label, index) =>
              label === null ? null : (
                <SvgText
                  key={`x-${index}`}
                  x={xAt(index)}
                  y={height - 8}
                  fontSize={10}
                  fill={colors.slate500}
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              ),
            )}
          </Svg>
        ) : (
          <View
            style={{
              height,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.hairline,
              alignItems: "center",
              justifyContent: "center",
              padding: spacing.md,
            }}
          >
            <Text style={{ ...typography.caption, textAlign: "center" }}>
              {emptyNote ?? "No published observations for this selection."}
            </Text>
          </View>
        )}
      </View>

      {note ? <Text style={typography.micro}>{note}</Text> : null}
    </View>
  );
}

/** Two or more distinguishable series on shared axes. */
export function MultiSeriesChart(props: TimeSeriesChartProps) {
  return <TimeSeriesChart {...props} />;
}

/**
 * Minimal inline trend line. No axes, no interaction — used in board rows where
 * the exact numbers are already printed next to it.
 */
export function Sparkline({
  points,
  width: widthProp,
  height = 34,
  color = colors.primary,
  accessibilityLabel,
}: {
  points: SeriesPoint[];
  width?: number;
  height?: number;
  color?: string;
  accessibilityLabel?: string;
}) {
  const [measured, setMeasured] = useState(0);
  const width = widthProp ?? measured;
  const domain = yDomain(points);
  const segments = seriesSegments(points);
  const count = points.length;
  const published = publishedCount(points);

  const xAt = (index: number) => (count <= 1 ? width / 2 : (index / (count - 1)) * width);
  const yAt = (value: number) => height - ((value - domain.min) / (domain.max - domain.min)) * height;

  return (
    <View
      onLayout={(event) => measureWidth(event, measured, setMeasured)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ??
        (published ? `Trend, ${published} published periods` : "No published periods")
      }
      style={{ height, alignSelf: "stretch" }}
    >
      {width > 0 && published > 0 ? (
        <Svg width={width} height={height}>
          {segments.map((segment) =>
            segment.points.length > 1 ? (
              <Path
                key={`sp-${segment.start}`}
                d={segment.points
                  .map((point, offset) => {
                    const index = segment.start + offset;
                    return `${offset === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value as number)}`;
                  })
                  .join(" ")}
                stroke={color}
                strokeWidth={1.75}
                fill="none"
                strokeLinecap="round"
              />
            ) : (
              <Circle
                key={`sp-dot-${segment.start}`}
                cx={xAt(segment.start)}
                cy={yAt(segment.points[0].value as number)}
                r={2}
                fill={color}
              />
            ),
          )}
        </Svg>
      ) : (
        <View style={{ height, borderBottomWidth: 1, borderBottomColor: colors.hairline }} />
      )}
    </View>
  );
}

export interface ShareSegment {
  key: string;
  label: string;
  value: number | null;
  color: string;
}

/**
 * Compact labelled stacked bar for composition shares.
 *
 * A share that was not published is excluded from the bar and reported as such
 * rather than being counted as zero, which would silently inflate the others.
 */
export function StackedShareBar({
  segments,
  unit = "%",
  sumOk,
  note,
}: {
  segments: ShareSegment[];
  unit?: string;
  /** The API's own check that the published shares add up. */
  sumOk?: boolean | null;
  note?: string;
}) {
  const published = segments.filter(
    (segment) => segment.value !== null && Number.isFinite(segment.value) && segment.value > 0,
  );
  const missing = segments.filter(
    (segment) => segment.value === null || !Number.isFinite(segment.value),
  );
  const total = published.reduce((sum, segment) => sum + (segment.value as number), 0);

  if (!published.length) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={typography.caption}>No published composition shares for this selection.</Text>
        {note ? <Text style={typography.micro}>{note}</Text> : null}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Composition: ${published
        .map((segment) => `${segment.label} ${(segment.value as number).toFixed(1)}${unit}`)
        .join(", ")}`}
      style={{ gap: spacing.sm }}
    >
      <View
        style={{
          flexDirection: "row",
          height: 20,
          borderRadius: radius.sm,
          overflow: "hidden",
          backgroundColor: colors.grid,
        }}
      >
        {published.map((segment) => (
          <View
            key={segment.key}
            style={{
              flexGrow: segment.value as number,
              flexBasis: 0,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {segments.map((segment) => (
          <View key={segment.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: segment.color }} />
            <Text numberOfLines={1} style={{ ...typography.numericSmall, flex: 1 }}>
              {segment.label}
            </Text>
            <Text style={typography.numeric}>
              {segment.value === null || !Number.isFinite(segment.value)
                ? "Not published"
                : `${segment.value.toFixed(2)}${unit}`}
            </Text>
          </View>
        ))}
      </View>
      {note ? <Text style={typography.micro}>{note}</Text> : null}
      {/* The API's own sum check is authoritative; the local total only fills
          the gap when the response does not carry one. */}
      {(sumOk ?? Math.abs(total - 100) <= 0.5) === false ? (
        <Text style={typography.micro}>
          {`Published shares add up to ${total.toFixed(1)}${unit}, not 100${unit}. They are shown exactly as published.`}
        </Text>
      ) : null}
      {missing.length ? (
        <Text style={typography.micro}>
          Not published for: {missing.map((segment) => segment.label).join(", ")}.
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible chart exports.
//
// These keep their previous call signatures so screens not yet migrated keep
// rendering, but they now measure their width instead of assuming 320 px.
// ---------------------------------------------------------------------------

const LEGACY_HEIGHT = 180;
const LEGACY_PAD = { top: 12, right: 12, bottom: 26, left: 40 };

function summary(values: SeriesPoint[], unit: string): string {
  const parts = values
    .filter((point) => point.value !== null)
    .map((point) => `${point.label} ${point.value}${unit ? ` ${unit}` : ""}`);
  return parts.length ? parts.join(", ") : "No data";
}

export function LineChart({
  values,
  unit = "",
  width,
  height = LEGACY_HEIGHT,
}: {
  values: SeriesPoint[];
  unit?: string;
  width?: number;
  height?: number;
}) {
  if (!values.length) return <EmptyState title="No trend data available." icon="trending-up-outline" />;
  return (
    <TimeSeriesChart
      series={[{ key: "series", label: "Value", points: values }]}
      unit={unit || null}
      height={height}
      width={width}
      accessibilityLabel={`Line chart. ${summary(values, unit)}`}
    />
  );
}

export function BarChart({
  values,
  unit = "",
  width: widthProp,
}: {
  values: SeriesPoint[];
  unit?: string;
  width?: number;
}) {
  const [measured, setMeasured] = useState(0);
  if (!values.length) return <EmptyState title="No data available." icon="bar-chart-outline" />;
  const width = widthProp ?? measured;
  const domain = yDomain(values);
  const { max } = { max: Math.max(domain.max, 0) };
  const innerW = Math.max(1, width - LEGACY_PAD.left - LEGACY_PAD.right);
  const innerH = LEGACY_HEIGHT - LEGACY_PAD.top - LEGACY_PAD.bottom;
  const slot = innerW / values.length;
  const barW = Math.max(8, Math.min(38, slot * 0.55));

  return (
    <View
      onLayout={(event) => measureWidth(event, measured, setMeasured)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Bar chart. ${summary(values, unit)}`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.md }}
    >
      {width > 0 ? (
        <Svg width={width} height={LEGACY_HEIGHT}>
          <Line
            x1={LEGACY_PAD.left}
            y1={LEGACY_PAD.top + innerH}
            x2={width - LEGACY_PAD.right}
            y2={LEGACY_PAD.top + innerH}
            stroke={colors.border}
          />
          {values.map((point, index) => {
            const height = point.value === null ? 0 : (point.value / max) * innerH;
            const cx = LEGACY_PAD.left + slot * index + slot / 2;
            return (
              <G key={`${point.label}-${index}`}>
                <Rect
                  x={cx - barW / 2}
                  y={LEGACY_PAD.top + innerH - height}
                  width={barW}
                  height={Math.max(height, 1)}
                  rx={4}
                  fill={point.value === null ? colors.missing : colors.primary}
                />
                <SvgText
                  x={cx}
                  y={LEGACY_HEIGHT - 8}
                  fontSize={9}
                  fill={colors.slate500}
                  textAnchor="middle"
                >
                  {point.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: LEGACY_HEIGHT }} />
      )}
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
  const max = Math.max(...rows.map((row) => row.value ?? 0), 1);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Horizontal bar chart. ${summary(rows, unit)}`}
      style={{ gap: spacing.sm }}
    >
      {rows.map((row, index) => {
        const pct = row.value === null ? 0 : Math.max(2, (row.value / max) * 100);
        return (
          <View key={`${row.label}-${index}`} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text numberOfLines={1} style={{ ...typography.caption, flex: 1 }}>
                {row.label}
              </Text>
              <Text style={styles.barValue}>
                {row.value === null ? "—" : `${formatValue(row.value)}${unit ? ` ${unit}` : ""}`}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: row.value === null ? colors.missing : colors.primary,
                  },
                ]}
              />
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
  const real = slices.filter((slice) => (slice.value ?? 0) > 0);
  const total = real.reduce((sum, slice) => sum + (slice.value ?? 0), 0);
  if (!real.length || total <= 0) {
    return <EmptyState title="No composition data available." icon="pie-chart-outline" />;
  }

  const size = 160;
  const ringWidth = 26;
  const radiusPx = (size - ringWidth) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  let offset = 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Composition chart. ${real
        .map((slice) => `${slice.label} ${slice.value}${unit}`)
        .join(", ")}`}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {real.map((slice) => {
            const fraction = (slice.value ?? 0) / total;
            const dash = fraction * circumference;
            const element = (
              <Circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radiusPx}
                stroke={slice.color}
                strokeWidth={ringWidth}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return element;
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
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
    overflow: "hidden" as const,
  },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  barValue: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.forestDeep,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
};
