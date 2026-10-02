/**
 * Factors associated with yield.
 *
 * A compact diverging-bar read of the API's Pearson correlations between
 * district practice adoption and a crop's yield. Deliberate properties:
 *
 * - **Diverging, centred at zero.** A negative coefficient is drawn to the left
 *   and coloured differently from a positive one, so sign is never implied away.
 * - **Association is never presented as a cause.** The warning is compact but
 *   always visible; the full method/limitations sit behind one tap.
 * - **Small samples are flagged in words.** A coefficient from a tiny sample is
 *   shown but labelled indicative, never silently trusted.
 * - **A missing coefficient is absent.** Factors with no correlation are not
 *   drawn as zero.
 */

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { radius, spacing } from "../../theme";
import type { Palette } from "../../theme";
import { useTheme, useThemedStyles } from "../../theme/theme-context";
import type { FactorMetric } from "../../types";
import { SourceMethodSheet } from "../data-view";

/** Below this many matched observations the web app flags a coefficient as indicative. */
const SMALL_SAMPLE = 8;

function formatCorrelation(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function FactorAssociation({
  factors,
  note,
  source,
  method,
  limitations,
}: {
  factors: FactorMetric[];
  note?: string | null;
  source?: string | null;
  method?: string | null;
  limitations?: string[] | null;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  const [open, setOpen] = useState(false);

  const rows = factors.filter((factor) => factor.correlation !== null);

  if (!rows.length) {
    return <Text style={typography.caption}>{note ?? t.noFactorAssociation}</Text>;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {/* Compact, always-visible scientific caveat; the method is one tap away. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t.associationNotCausation}
        onPress={() => setOpen((value) => !value)}
        style={styles.warning}
      >
        <Ionicons name="information-circle-outline" size={14} color={colors.amber} />
        <Text style={{ ...typography.micro, flex: 1, color: colors.slate700 }}>
          {t.associationNotCausation}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.slate500} />
      </Pressable>

      {open ? (
        <View style={{ gap: 6 }}>
          <Text style={typography.micro}>
            {rows[0]?.interpretation ?? "Association only; not evidence of causation."}
          </Text>
          <SourceMethodSheet
            title={t.sourceAndMethod}
            source={source}
            coverage={t.factorsSubtitle}
            method={method}
            limitations={limitations}
          />
        </View>
      ) : null}

      {rows.map((factor) => {
        const correlation = factor.correlation as number;
        const positive = correlation >= 0;
        const width = `${Math.min(1, Math.abs(correlation)) * 50}%` as `${number}%`;
        const fillPosition = positive ? { left: "50%" as const } : { right: "50%" as const };
        const small = factor.n_observations < SMALL_SAMPLE;

        return (
          <View
            key={factor.factor}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${factor.label}: correlation ${formatCorrelation(correlation)}, ${
              factor.n_observations
            } ${t.factorObservations}${small ? `, ${t.factorSmallSample}` : ""}`}
            style={{ gap: 3 }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
              <Text numberOfLines={1} style={{ ...typography.caption, flex: 1 }}>
                {factor.label}
              </Text>
              <Text
                style={{
                  ...typography.numericSmall,
                  color: positive ? colors.primaryStrong : colors.amber,
                }}
              >
                {formatCorrelation(correlation)}
              </Text>
            </View>

            <View style={styles.track}>
              <View style={styles.center} />
              <View
                style={[
                  styles.fill,
                  fillPosition,
                  { width, backgroundColor: positive ? colors.primary : colors.amber },
                ]}
              />
            </View>

            <Text style={typography.micro}>
              {`n = ${factor.n_observations}`}
              {small ? ` · ${t.factorSmallSample}` : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.grid,
    overflow: "hidden",
  },
  center: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
});
