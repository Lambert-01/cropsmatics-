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

import type { LayoutChangeEvent } from "react-native";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { chart, gradient, radius, seriesColor, shadow, spacing } from "../theme";
import type { Palette } from "../theme";
import { useTheme, useThemedStyles } from "../theme/theme-context";
import type { SeriesPoint } from "../utils/analytics";
import { isScrubIntent, isTapMovement } from "../utils/chartGesture";
import type { TouchPoint } from "../utils/chartGesture";
import { divergingBar, hasNegative, maxMagnitude } from "../utils/diverging";
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
 * Period + value readout.
 *
 * This is simultaneously the legend, the crosshair readout and the screen
 * reader's value, so the three can never disagree. Visually it is a plate in
 * its own right — a gradient period chip, then one row per series with a
 * colour lozenge and the figure set large — because it is the part of a chart
 * a user reads first.
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
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const label = series[0]?.points[index]?.label ?? "—";
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.hairline,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        gap: 6,
        ...shadow.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <LinearGradient
          colors={gradient.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: colors.white }}>
            {String(label).toUpperCase()}
          </Text>
        </LinearGradient>
        {unit ? (
          <View
            style={{
              backgroundColor: colors.mint,
              borderRadius: radius.pill,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primaryStrong }}>
              {unit}
            </Text>
          </View>
        ) : null}
      </View>
      {series.map((item) => {
        const value = item.points[index]?.value ?? null;
        return (
          <View
            key={item.key}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
          >
            <View
              style={{
                width: 22,
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: item.color,
              }}
            />
            <Text numberOfLines={1} style={{ ...typography.bodySmall, flex: 1 }}>
              {item.label}
            </Text>
            {value === null ? (
              <Text style={{ ...typography.numericSmall, color: colors.slate500 }}>
                {t.chartNoDataShort}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                <Text style={{ ...typography.numericLarge, fontSize: 19 }}>
                  {formatValue(value)}
                </Text>
                {unit ? <Text style={typography.unit}>{unit}</Text> : null}
              </View>
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
  /**
   * Controlled crosshair selection. When present the chart renders this index
   * instead of keeping its own, so an inline chart and its full-screen copy
   * can be driven from one shared selection (the parent follows `onSelectIndex`).
   */
  selectedIndex?: number | null;
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
  selectedIndex: selectedIndexProp,
  onSelectIndex,
  note,
  emptyNote,
  accessibilityLabel,
}: TimeSeriesChartProps) {
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const prepared = prepare(series);
  const [measured, setMeasured] = useState(0);
  const [internalSelected, setInternalSelected] = useState<number | null>(null);
  const controlled = selectedIndexProp !== undefined;
  const selected = controlled ? selectedIndexProp : internalSelected;

  // Gesture bookkeeping. The plot never claims the responder at touch start;
  // it records where the touch began and only takes over once movement is
  // clearly horizontal, so the screen keeps its vertical scroll. Touches the
  // parent wins are cancelled, which lands in `onTouchCancel`.
  const touchStartRef = useRef<TouchPoint | null>(null);
  const scrubbedRef = useRef(false);

  const height = heightProp ?? chart.height;
  const width = widthProp ?? measured;
  const labels = prepared[0]?.points.map((point) => point.label) ?? [];
  const count = labels.length;

  const domain = yDomain(prepared.flatMap((item) => item.points));
  const ticks = niceTicks(domain.min, domain.max, 4);
  const hasData = prepared.some((item) => publishedCount(item.points) > 0);
  const lastPublished = lastPublishedIndex(prepared, count);
  // A controlled index can outlive its series (a window change shrinks the
  // points); clamp rather than index past the end of the array.
  const activeIndex =
    selected === null
      ? lastPublished
      : Math.min(count - 1, Math.max(0, selected));

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
      ? t.chartNoPeriods
      : `${labels[activeIndex] ?? ""}: ${prepared
          .map((item) => {
            const value = item.points[activeIndex]?.value ?? null;
            return `${item.label} ${
              value === null
                ? t.chartNoDataShort
                : `${formatValue(value)}${unit ? ` ${unit}` : ""}`
            }`;
          })
          .join(", ")}`;

  const commit = (index: number | null) => {
    if (!controlled) setInternalSelected(index);
    onSelectIndex?.(index, index === null ? null : labels[index] ?? null);
  };

  const selectAt = (locationX: number) => {
    if (count === 0) return;
    commit(nearestIndex(locationX, pad.left, innerW, count));
  };

  const step = (direction: 1 | -1) => {
    if (count === 0) return;
    commit(Math.min(count - 1, Math.max(0, activeIndex + direction)));
  };

  /** Touch payload → page-relative point, or null when there is no touch. */
  const touchPoint = (touch: { pageX: number; pageY: number } | undefined): TouchPoint | null =>
    touch ? { x: touch.pageX, y: touch.pageY } : null;

  const resetGesture = () => {
    touchStartRef.current = null;
    scrubbedRef.current = false;
  };

  const hasSelection = selected !== null && count > 0;

  return (
    <View style={{ gap: spacing.sm }}>
      <Readout series={prepared} index={activeIndex} unit={unit} />

      <View
        onLayout={(event) => measureWidth(event, measured, setMeasured)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel ?? t.chartTimeSeriesA11y}
        accessibilityValue={{ text: readoutText }}
        accessibilityHint={t.chartsPeriodSwipeHint}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") step(1);
          if (event.nativeEvent.actionName === "decrement") step(-1);
        }}
        /* Touch handling. The plot never takes the responder on touch start —
           that would ask Android to stop the parent from intercepting motion
           events and freeze vertical scrolling. It records where the touch
           began, claims the responder only once movement is clearly
           horizontal (a scrub), and treats a movement that stayed inside the
           slop radius at touch end as a tap. Touches the parent wins arrive as
           `onTouchCancel` and are dropped. */
        onTouchStart={(event) => {
          const touches = event.nativeEvent.touches;
          // A second finger abandons the gesture entirely.
          touchStartRef.current = touches.length > 1 ? null : touchPoint(touches[0]);
          scrubbedRef.current = false;
        }}
        onMoveShouldSetResponder={(event) => {
          if (count === 0) return false;
          const current = touchPoint(event.nativeEvent.touches[0]);
          return current !== null && isScrubIntent(touchStartRef.current, current);
        }}
        onResponderGrant={(event) => {
          scrubbedRef.current = true;
          selectAt(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => {
          if (!scrubbedRef.current) return;
          selectAt(event.nativeEvent.locationX);
        }}
        onResponderTerminate={() => resetGesture()}
        onResponderTerminationRequest={() => true}
        onTouchEnd={(event) => {
          // Runs after a release too, so the scrub flag is read before it is
          // cleared: a completed scrub must not be re-read as a tap.
          const start = touchStartRef.current;
          const scrubbed = scrubbedRef.current;
          const endPoint = touchPoint(event.nativeEvent.changedTouches[0]);
          resetGesture();
          if (scrubbed || count === 0 || !start || !endPoint) return;
          if (isTapMovement(start, endPoint)) selectAt(event.nativeEvent.locationX);
        }}
        onTouchCancel={() => resetGesture()}
        style={{
          alignSelf: "stretch",
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.surface,
          overflow: "hidden",
          ...shadow.card,
        }}
      >
        {width > 0 && count > 0 && hasData ? (
          <View style={{ height, position: "relative" }}>
            {/* Tinted plot plate: a gradient wash reads as depth where a flat
                fill reads as an empty box. */}
            <LinearGradient
              colors={gradient.mint}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Svg width={width} height={height}>
            <Defs>
              {prepared.map((item, i) => (
                <SvgGradient
                  key={`grad-${item.key}`}
                  id={`areaGrad${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={item.color} stopOpacity={0.4} />
                  <Stop offset="0.55" stopColor={item.color} stopOpacity={0.14} />
                  <Stop offset="1" stopColor={item.color} stopOpacity={0.02} />
                </SvgGradient>
              ))}
            </Defs>

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
                  fontWeight="600"
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
                strokeWidth={1.5}
              />
            ) : null}

            {/* Baseline */}
            <Line
              x1={pad.left}
              y1={pad.top + innerH}
              x2={width - pad.right}
              y2={pad.top + innerH}
              stroke={colors.border}
              strokeWidth={1.5}
            />

            {/* Filled area under each series */}
            {prepared.map((item, i) => {
              const segments = seriesSegments(item.points);
              return segments.map((segment) => {
                if (segment.points.length < 2) return null;
                const linePts = segment.points.map((point, offset) => {
                  const idx = segment.start + offset;
                  return `${xAt(idx)},${yAt(point.value as number)}`;
                });
                const baseline = pad.top + innerH;
                const firstX = xAt(segment.start);
                const lastX = xAt(segment.start + segment.points.length - 1);
                const areaD =
                  `M ${firstX} ${baseline} ` +
                  linePts.map((pt, offset) => `${offset === 0 ? "L" : "L"} ${pt}`).join(" ") +
                  ` L ${lastX} ${baseline} Z`;
                return (
                  <Path
                    key={`area-${item.key}-${segment.start}`}
                    d={areaD}
                    fill={`url(#areaGrad${i})`}
                  />
                );
              });
            })}

            {/* Crosshair — solid and soft rather than dashed, so it reads as a
                selection cursor and not as another grid line. */}
            {hasSelection ? (
              <G>
                <Line
                  x1={xAt(activeIndex)}
                  y1={pad.top}
                  x2={xAt(activeIndex)}
                  y2={pad.top + innerH}
                  stroke={colors.primary}
                  strokeWidth={2}
                  strokeOpacity={0.35}
                />
                <Circle
                  cx={xAt(activeIndex)}
                  cy={pad.top}
                  r={4}
                  fill={colors.primary}
                />
              </G>
            ) : null}

            {prepared.map((item) => {
              const segments = seriesSegments(item.points);
              return (
                <G key={item.key}>
                  {/* A pale halo under the line lifts it off the gradient and
                      off the grid without changing the series colour. */}
                  {segments.map((segment) =>
                    segment.points.length > 1 ? (
                      <Path
                        key={`halo-${item.key}-${segment.start}`}
                        d={segment.points
                          .map((point, offset) => {
                            const index = segment.start + offset;
                            return `${offset === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value as number)}`;
                          })
                          .join(" ")}
                        stroke={colors.surface}
                        strokeOpacity={0.8}
                        strokeWidth={chart.strokeWidth + 3.5}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null,
                  )}
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
                        strokeWidth={chart.strokeWidth + 1}
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
                        r={chart.pointRadius + 1}
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
                            fill={colors.surface}
                            stroke={item.color}
                            strokeWidth={2}
                          />
                        ),
                      )
                    : null}
                  {hasSelection
                    ? (() => {
                        const value = item.points[activeIndex]?.value ?? null;
                        if (value === null) return null;
                        const cx = xAt(activeIndex);
                        const cy = yAt(value);
                        return (
                          <G>
                            <Circle cx={cx} cy={cy} r={16} fill={item.color} opacity={0.16} />
                            <Circle cx={cx} cy={cy} r={6.5} fill={colors.surface} stroke={item.color} strokeWidth={3} />
                          </G>
                        );
                      })()
                    : null}
                </G>
              );
            })}

            {xLabels.map((label, index) =>
              label === null ? null : (
                <SvgText
                  key={`x-${index}`}
                  x={xAt(index)}
                  y={height - 7}
                  fontSize={10}
                  fill={index === activeIndex ? colors.primaryStrong : colors.slate500}
                  textAnchor="middle"
                  fontWeight={index === activeIndex ? "800" : "600"}
                >
                  {label}
                </SvgText>
              ),
            )}
            </Svg>
          </View>
        ) : (
          <View
            style={{
              height,
              alignItems: "center",
              justifyContent: "center",
              padding: spacing.md,
              backgroundColor: colors.mint,
            }}
          >
            <Text style={{ ...typography.caption, textAlign: "center" }}>
              {emptyNote ?? t.noPublishedObservations}
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
 *
 * Carries a gradient area under the stroke so a row of sparklines reads as a
 * field of trends rather than a row of stray wires.
 */
let sparklineSeq = 0;

export function Sparkline({
  points,
  width: widthProp,
  height = 34,
  color,
  accessibilityLabel,
}: {
  points: SeriesPoint[];
  width?: number;
  height?: number;
  color?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const strokeColor = color ?? colors.primary;
  const [measured, setMeasured] = useState(0);
  const [gradId] = useState(() => `spark-${(sparklineSeq += 1)}`);
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
        (published
          ? t.trendSummaryA11y.replace("{count}", String(published))
          : t.noPublishedPeriods)
      }
      style={{ height, alignSelf: "stretch" }}
    >
      {width > 0 && published > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={strokeColor} stopOpacity={0.34} />
              <Stop offset="1" stopColor={strokeColor} stopOpacity={0.02} />
            </SvgGradient>
          </Defs>
          {segments.map((segment) =>
            segment.points.length > 1 ? (
              <Path
                key={`spa-${segment.start}`}
                d={
                  `M ${xAt(segment.start)} ${height} ` +
                  segment.points
                    .map((point, offset) => {
                      const index = segment.start + offset;
                      return `L ${xAt(index)} ${yAt(point.value as number)}`;
                    })
                    .join(" ") +
                  ` L ${xAt(segment.start + segment.points.length - 1)} ${height} Z`
                }
                fill={`url(#${gradId})`}
              />
            ) : null,
          )}
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
                stroke={strokeColor}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <Circle
                key={`sp-dot-${segment.start}`}
                cx={xAt(segment.start)}
                cy={yAt(segment.points[0].value as number)}
                r={2.5}
                fill={strokeColor}
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
  const { colors, typography } = useTheme();
  const t = strings(useAppStore((s) => s.language));
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
        <Text style={typography.caption}>{t.noPublishedComposition}</Text>
        {note ? <Text style={typography.micro}>{note}</Text> : null}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t.chartCompositionReadout.replace(
        "{items}",
        published
          .map((segment) => `${segment.label} ${(segment.value as number).toFixed(1)}${unit}`)
          .join(", "),
      )}
      style={{ gap: spacing.sm }}
    >
      <View
        style={{
          flexDirection: "row",
          height: 26,
          gap: 2,
          borderRadius: radius.pill,
          overflow: "hidden",
          backgroundColor: colors.grid,
          ...shadow.card,
        }}
      >
        {published.map((segment) => (
          <View
            key={segment.key}
            style={{
              flexGrow: segment.value as number,
              flexBasis: 0,
              backgroundColor: segment.color,
              borderRadius: radius.pill,
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
                ? t.notPublished
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
          {t.composeSumMismatch
            .replace("{total}", total.toFixed(1))
            .replace("{unit}", unit)
            .replace("{unit}", unit)}
        </Text>
      ) : null}
      {missing.length ? (
        <Text style={typography.micro}>
          {t.composeNotPublishedFor.replace(
            "{items}",
            missing.map((segment) => segment.label).join(", "),
          )}
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

function summary(values: SeriesPoint[], unit: string, empty: string): string {
  const parts = values
    .filter((point) => point.value !== null)
    .map((point) => `${point.label} ${point.value}${unit ? ` ${unit}` : ""}`);
  return parts.length ? parts.join(", ") : empty;
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
  const t = strings(useAppStore((s) => s.language));
  if (!values.length) return <EmptyState title={t.chartNoTrendData} icon="trending-up-outline" />;
  return (
    <TimeSeriesChart
      series={[{ key: "series", label: "Value", points: values }]}
      unit={unit || null}
      height={height}
      width={width}
      accessibilityLabel={t.chartLineA11y.replace("{summary}", summary(values, unit, t.chartNoDataShort))}
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
  const { colors } = useTheme();
  const t = strings(useAppStore((s) => s.language));
  const [measured, setMeasured] = useState(0);
  if (!values.length) return <EmptyState title={t.chartNoData} icon="bar-chart-outline" />;
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
      accessibilityLabel={t.chartBarA11y.replace("{summary}", summary(values, unit, t.chartNoDataShort))}
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
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const rows = values.slice(0, maxItems);
  if (!rows.length) return <EmptyState title={t.chartNoData} icon="stats-chart-outline" />;

  const rowValues = rows.map((row) => row.value);
  // A signed series (the productivity gap index is the only one) needs a zero
  // baseline; scaling it as `value / max` collapsed every above-benchmark value
  // into the same minimum-width stub. Unsigned series keep the original layout.
  const diverging = hasNegative(rowValues);
  const maxAbs = maxMagnitude(rowValues);
  const max = Math.max(
    ...rowValues.map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value : 0,
    ),
    1,
  );

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t.chartHBarA11y.replace("{summary}", summary(rows, unit, t.chartNoDataShort))}
      style={{ gap: spacing.sm }}
    >
      {diverging ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={typography.micro}>{t.gapAboveBenchmark}</Text>
          <Text style={typography.micro}>{t.gapBelowBenchmark}</Text>
        </View>
      ) : null}
      {rows.map((row, index) => {
        const pct = row.value === null ? 0 : Math.max(2, (row.value / max) * 100);
        const bar = divergingBar(row.value, maxAbs);
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
              {diverging ? (
                <>
                  <View
                    style={[
                      styles.barFillAbs,
                      bar.negative
                        ? { right: "50%", width: `${bar.widthPct / 2}%`, backgroundColor: colors.success }
                        : { left: "50%", width: `${bar.widthPct / 2}%`, backgroundColor: colors.danger },
                    ]}
                  />
                  <View style={[styles.barCenter, { backgroundColor: colors.border }]} />
                </>
              ) : row.value === null ? (
                <View
                  style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.missing }]}
                />
              ) : (
                <LinearGradient
                  colors={gradient.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.barFill, { width: `${pct}%` }]}
                />
              )}
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
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const real = slices.filter((slice) => (slice.value ?? 0) > 0);
  const total = real.reduce((sum, slice) => sum + (slice.value ?? 0), 0);
  if (!real.length || total <= 0) {
    return <EmptyState title={t.chartNoComposition} icon="pie-chart-outline" />;
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
      accessibilityLabel={t.chartCompositionA11y.replace(
        "{items}",
        real.map((slice) => `${slice.label} ${slice.value}${unit}`).join(", "),
      )}
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

const makeStyles = (colors: Palette) => ({
  barTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
    overflow: "hidden" as const,
    position: "relative" as const,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  /** Fill background is supplied by the gradient; this is the flat fallback. */
  barFill: { height: 14, borderRadius: 999 },
  // Diverging fills are absolutely positioned against the 50 % baseline.
  barFillAbs: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  barCenter: {
    position: "absolute" as const,
    left: "50%" as const,
    top: 0,
    bottom: 0,
    width: 1.5,
    marginLeft: -0.75,
    opacity: 0.8,
  },
  barValue: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.forestDeep,
    fontVariant: ["tabular-nums"] as ["tabular-nums"],
  },
});
