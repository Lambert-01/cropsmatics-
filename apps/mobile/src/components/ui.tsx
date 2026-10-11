import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { gradient, radius, shadow, spacing } from "../theme";
import type { Palette, Typography } from "../theme";
import { useTheme, useThemedStyles } from "../theme/theme-context";

// ---- layout ---------------------------------------------------------------

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={typography.h2}>{title}</Text>
        {subtitle ? <Text style={typography.caption}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

// ---- cards ----------------------------------------------------------------

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const body = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  onPress,
  accent,
}: {
  label: string;
  value: string;
  unit?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accent?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const accentColor = accent ?? colors.primary;
  return (
    <Card style={styles.statCard} onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.statIcon, { backgroundColor: colors.mintSoft }]}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.statLabel}>
        {label}
        {unit ? ` · ${unit}` : ""}
      </Text>
    </Card>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && onPress ? { opacity: 0.7 } : null]}
    >
      {icon ? (
        <View style={styles.listIcon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.listTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={typography.caption}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={styles.listMeta}>{meta}</Text> : null}
      </View>
      {right ?? (
        onPress ? (
          <View style={styles.listChevron}>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </View>
        ) : null
      )}
    </Pressable>
  );
}

// ---- badges ---------------------------------------------------------------

export function Badge({
  text,
  tone = "mint",
}: {
  text: string;
  tone?: "mint" | "blue" | "amber" | "slate";
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tones: Record<string, { bg: string; fg: string }> = {
    mint: { bg: colors.mint, fg: colors.primaryStrong },
    blue: { bg: colors.blueSoft, fg: colors.blue },
    amber: { bg: colors.amberSoft, fg: colors.amber },
    slate: { bg: colors.background, fg: colors.slate500 },
  };
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

// ---- buttons --------------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && { opacity: 0.6 },
        pressed && !disabled ? { opacity: 0.85 } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={colors.white} /> : null}
          <Text style={styles.primaryButtonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed ? { opacity: 0.8 } : null]}
    >
      {icon ? <Ionicons name={icon} size={17} color={colors.primaryStrong} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

// ---- search ---------------------------------------------------------------

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onFocus,
  autoFocus,
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder: string;
  onFocus?: () => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={18} color={colors.slate500} />
      <TextInput
        accessibilityLabel={placeholder}
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.slate500}
        onFocus={onFocus}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
    </View>
  );
}

// ---- filters --------------------------------------------------------------

export function FilterChip({
  label,
  selected,
  onPress,
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      // The chip stays visually compact for density; hitSlop brings the actual
      // touch target up to the Android minimum without inflating the row.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      {selected ? (
        <LinearGradient
          colors={gradient.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
      {onRemove ? (
        <Ionicons
          name="close"
          size={13}
          color={selected ? colors.white : colors.slate500}
          onPress={onRemove}
        />
      ) : null}
    </Pressable>
  );
}

// ---- states ---------------------------------------------------------------

export function EmptyState({
  title,
  message,
  icon = "information-circle-outline",
  action,
}: {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: ReactNode;
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.state}>
      <Ionicons name={icon} size={30} color={colors.slate300} />
      <Text style={{ ...typography.h3, textAlign: "center" }}>{title}</Text>
      {message ? <Text style={{ ...typography.caption, textAlign: "center" }}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  return (
    <View style={styles.state}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
      <Text style={{ ...typography.h3, textAlign: "center" }}>{message}</Text>
      {onRetry ? <SecondaryButton label={t.tryAgain} onPress={onRetry} icon="refresh" /> : null}
    </View>
  );
}

export function OfflineBanner({ text }: { text: string }) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={15} color={colors.amber} />
      <Text style={{ ...typography.caption, flex: 1 }}>{text}</Text>
    </View>
  );
}

export function LoadingSkeleton({ height = 80 }: { height?: number }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.skeleton, { height }]} />;
}

// ---- source / coverage metadata ------------------------------------------

export function SourceCard({
  sourceLabel,
  period,
  coverage,
  limitations,
}: {
  sourceLabel?: string | null;
  period?: string | null;
  coverage?: string | null;
  limitations?: string[];
}) {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = strings(useAppStore((s) => s.language));
  if (!sourceLabel && !period && !coverage) return null;
  return (
    <View style={styles.sourceCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text style={styles.sourceTitle}>{t.sourceCoverageTitle}</Text>
      </View>
      {sourceLabel ? <Text style={typography.caption}>{sourceLabel}</Text> : null}
      <Text style={styles.sourceMeta}>
        {[
          period ? t.sourceCoveragePeriod.replace("{period}", period) : null,
          coverage ? t.sourceCoverageLevel.replace("{level}", coverage) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {limitations?.length ? (
        <Text style={styles.sourceMeta}>
          {t.sourceCoverageLimitations.replace("{items}", limitations.join("; "))}
        </Text>
      ) : null}
    </View>
  );
}

export function InfoRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  const { typography } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.infoRow}>
      <Text style={{ ...typography.caption, flex: 1 }}>{label}</Text>
      <View style={{ alignItems: "flex-end", maxWidth: "55%" }}>
        <Text style={styles.infoValue}>{value}</Text>
        {note ? <Text style={styles.listMeta}>{note}</Text> : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette, typography: Typography) =>
  StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  statCard: { flexBasis: "47%", flexGrow: 1, minHeight: 104, padding: spacing.md },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { ...typography.display, fontSize: 26 },
  statLabel: { ...typography.caption, fontSize: 12 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  listTitle: { ...typography.h3, fontSize: 14, fontWeight: "600" },
  listMeta: { ...typography.micro, color: colors.slate500, marginTop: 1 },
  listChevron: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { color: colors.primaryStrong, fontSize: 15, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    minHeight: 54,
    ...shadow.strong,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.slate900, paddingVertical: 11 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    // Clips the selected chip's gradient fill to the pill.
    overflow: "hidden",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.slate700, fontWeight: "600" },
  chipTextSelected: { color: colors.white },
  state: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  skeleton: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.lg,
    opacity: 0.7,
  },
  sourceCard: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 3,
  },
  sourceTitle: { fontSize: 12, fontWeight: "700", color: colors.primaryStrong },
  sourceMeta: { ...typography.micro, color: colors.slate500 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoValue: { fontSize: 15, fontWeight: "700", color: colors.forestDeep },
});
