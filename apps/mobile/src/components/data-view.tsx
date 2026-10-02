/**
 * Reusable pieces of the analytical interface: metric readouts, change
 * indicators, selectors, coverage badges and the collapsible source/method
 * sheet.
 *
 * They exist so every screen presents a value, its unit, its period and its
 * provenance the same way — and so a value can never be rendered without the
 * unit it was published in.
 */

import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import type { ChangeResult } from "../utils/analytics";
import { formatPercent, formatValue } from "../utils/analytics";

// ---- numeric surfaces -------------------------------------------------------

export function MetricReadout({
  label,
  value,
  unit,
  precision,
  note,
  change,
  size = "large",
  tone = "neutral",
}: {
  label: string;
  /** null renders as "Not published" — never as 0. */
  value: number | null | undefined;
  unit?: string | null;
  precision?: number;
  note?: string | null;
  change?: ChangeResult | null;
  size?: "large" | "medium";
  tone?: "neutral" | "positive" | "negative";
}) {
  const published = value !== null && value !== undefined && Number.isFinite(value);
  return (
    <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
      <Text style={typography.microCaps}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            ...(size === "large" ? typography.numericLarge : typography.numeric),
            color: published
              ? tone === "positive"
                ? colors.primaryStrong
                : tone === "negative"
                  ? colors.danger
                  : colors.forestDeep
              : colors.slate500,
          }}
        >
          {published ? formatValue(value, precision) : "Not published"}
        </Text>
        {published && unit ? <Text style={typography.unit}>{unit}</Text> : null}
      </View>
      {note ? <Text style={typography.micro}>{note}</Text> : null}
      {change ? <ChangeIndicator change={change} /> : null}
    </View>
  );
}

/**
 * Same-season change.
 *
 * Direction is carried by a glyph and an explicit sign; the colour defaults to
 * neutral because whether a rise is good depends on the metric, not on the
 * number. Callers that genuinely know the direction pass a tone.
 *
 * Rendering nothing is deliberate: if there is no comparable earlier published
 * observation there is no percentage to show. `unavailableNote` is how a screen
 * says so in words instead of showing a fabricated 0%.
 */
export function ChangeIndicator({
  change,
  tone = "neutral",
  unavailableNote,
  compact = true,
}: {
  change: ChangeResult | null;
  tone?: "neutral" | "positive" | "negative";
  unavailableNote?: string;
  compact?: boolean;
}) {
  if (!change) {
    if (!unavailableNote) return null;
    return (
      <Text style={typography.micro}>
        {unavailableNote}
      </Text>
    );
  }

  const rising = change.changePct > 0;
  const flat = change.changePct === 0;
  const glyph = flat ? "■" : rising ? "▲" : "▼";
  const colour =
    tone === "neutral"
      ? colors.slate700
      : (tone === "positive") === rising
        ? colors.primaryStrong
        : colors.danger;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <Text
        style={{
          ...typography.numericSmall,
          color: colour,
        }}
      >
        {glyph} {formatPercent(change.changePct)}
      </Text>
      <Text style={typography.micro}>
        {compact
          ? `vs ${change.previous.label}`
          : `same season ${change.previous.label} (${formatValue(change.previous.value)})`}
      </Text>
    </View>
  );
}

// ---- selectors --------------------------------------------------------------

export interface SelectorOption {
  id: string;
  label: string;
  /** Tiny qualifier under the label, e.g. the unit or the coverage level. */
  hint?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
}

function Chip({
  label,
  hint,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  hint?: string | null;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.chip,
        selected ? styles.chipSelected : null,
        disabled ? styles.chipDisabled : null,
      ]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
      {hint ? (
        <Text style={[styles.chipHint, selected ? styles.chipHintSelected : null]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

export function MetricSelector({
  options,
  value,
  onChange,
  label,
}: {
  options: SelectorOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={typography.microCaps}>{label.toUpperCase()}</Text> : null}
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            hint={option.hint}
            selected={option.id === value}
            disabled={option.disabled}
            onPress={() => onChange(option.id)}
          />
        ))}
      </View>
      {options
        .filter((option) => option.disabled && option.disabledReason && option.id === value)
        .map((option) => (
          <Text key={option.id} style={typography.micro}>
            {option.disabledReason}
          </Text>
        ))}
    </View>
  );
}

export function PeriodSelector({
  options,
  value,
  onChange,
  label,
}: {
  options: SelectorOption[];
  /** null means "the latest published period", chosen by the API. */
  value: string | null;
  onChange: (code: string | null) => void;
  label?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      {label ? <Text style={typography.microCaps}>{label.toUpperCase()}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            hint={option.hint}
            selected={value === option.id}
            disabled={option.disabled}
            onPress={() => onChange(option.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---- provenance -------------------------------------------------------------

/**
 * Compact coverage/source badge. `level` is the API's own coverage word, so the
 * screen never has to infer it.
 */
export function CoverageBadge({
  level,
  period,
  source,
}: {
  level?: string | null;
  period?: string | null;
  source?: string | null;
}) {
  const parts = [level ? `${level} coverage` : null, period, source].filter(Boolean) as string[];
  if (!parts.length) return null;
  return (
    <View style={styles.badge}>
      <Ionicons name="shield-checkmark-outline" size={11} color={colors.primaryStrong} />
      <Text numberOfLines={1} style={styles.badgeText}>
        {parts.join(" · ")}
      </Text>
    </View>
  );
}

/**
 * A prominent warning that must stay visible — "national only", "unverified",
 * "single release". These are never folded into the collapsible sheet below.
 */
export function DataWarning({
  text,
  tone = "amber",
}: {
  text: string;
  tone?: "amber" | "slate";
}) {
  return (
    <View
      style={[
        styles.warning,
        { backgroundColor: tone === "amber" ? colors.amberSoft : colors.background },
      ]}
    >
      <Ionicons
        name="alert-circle-outline"
        size={13}
        color={tone === "amber" ? colors.amber : colors.slate500}
      />
      <Text style={{ ...typography.micro, flex: 1, color: colors.slate700 }}>{text}</Text>
    </View>
  );
}

/**
 * Compact expandable source/method sheet.
 *
 * Collapsed it is a one-line provenance strip; expanded it carries the full
 * method, unit, limitations and any extra notes. Crucial caveats belong in
 * `DataWarning` above it, not in here.
 */
export function SourceMethodSheet({
  source,
  period,
  coverage,
  unit,
  method,
  limitations,
  notes,
  extra,
  title = "Source & method",
}: {
  source?: string | null;
  period?: string | null;
  coverage?: string | null;
  unit?: string | null;
  method?: string | null;
  limitations?: string[] | null;
  notes?: string[] | null;
  extra?: ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.sheet}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((current) => !current)}
        style={styles.sheetHeader}
      >
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text style={{ ...typography.microCaps, flex: 1 }}>{title.toUpperCase()}</Text>
        <Text numberOfLines={1} style={{ ...typography.micro, maxWidth: "52%" }}>
          {[coverage, period].filter(Boolean).join(" · ") || source || "—"}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.slate500}
        />
      </Pressable>

      {open ? (
        <View style={{ gap: 6, paddingBottom: spacing.sm }}>
          <SheetRow label="Source" value={source} />
          <SheetRow label="Period" value={period} />
          <SheetRow label="Coverage" value={coverage} />
          <SheetRow label="Unit" value={unit} />
          <SheetRow label="Method" value={method} />
          {limitations?.length ? (
            <View style={{ gap: 2 }}>
              <Text style={typography.microCaps}>LIMITATIONS</Text>
              {limitations.map((item) => (
                <Text key={item} style={typography.micro}>
                  • {item}
                </Text>
              ))}
            </View>
          ) : null}
          {notes?.length ? (
            <View style={{ gap: 2 }}>
              <Text style={typography.microCaps}>NOTES</Text>
              {notes.map((item) => (
                <Text key={item} style={typography.micro}>
                  • {item}
                </Text>
              ))}
            </View>
          ) : null}
          {extra}
        </View>
      ) : null}
    </View>
  );
}

function SheetRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <Text style={{ ...typography.micro, width: 72 }}>{label}</Text>
      <Text style={{ ...typography.micro, flex: 1, color: colors.slate700 }}>{value}</Text>
    </View>
  );
}

/**
 * Flat analytical section: a title row, a hairline, then content.
 *
 * Used instead of a card so a long screen reads as one continuous data surface
 * rather than a stack of boxes.
 */
export function DataSection({
  title,
  subtitle,
  right,
  children,
  first = false,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingTop: first ? 0 : spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.hairline,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.h3}>{title}</Text>
          {subtitle ? <Text style={typography.caption}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 13, color: colors.slate700, fontWeight: "600" },
  chipTextSelected: { color: colors.white },
  chipHint: { fontSize: 10, color: colors.slate500, fontVariant: ["tabular-nums"] },
  chipHintSelected: { color: colors.mintLight },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.mint,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.primaryStrong, flexShrink: 1 },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  sheet: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
});
