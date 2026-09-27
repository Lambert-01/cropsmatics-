import { Ionicons } from "@expo/vector-icons";
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

import { colors, radius, shadow, spacing, typography } from "../theme";

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
  accent = colors.primary,
}: {
  label: string;
  value: string;
  unit?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accent?: string;
}) {
  return (
    <Card style={styles.statCard} onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.statIcon, { backgroundColor: colors.mintSoft }]}>
        <Ionicons name={icon} size={16} color={accent} />
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
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.slate300} /> : null)}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
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
  return (
    <View style={styles.state}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
      <Text style={{ ...typography.h3, textAlign: "center" }}>{message}</Text>
      {onRetry ? <SecondaryButton label="Try Again" onPress={onRetry} icon="refresh" /> : null}
    </View>
  );
}

export function OfflineBanner({ text }: { text: string }) {
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={15} color={colors.amber} />
      <Text style={{ ...typography.caption, flex: 1 }}>{text}</Text>
    </View>
  );
}

export function LoadingSkeleton({ height = 80 }: { height?: number }) {
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
  if (!sourceLabel && !period && !coverage) return null;
  return (
    <View style={styles.sourceCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text style={styles.sourceTitle}>Source &amp; coverage</Text>
      </View>
      {sourceLabel ? <Text style={typography.caption}>{sourceLabel}</Text> : null}
      <Text style={styles.sourceMeta}>
        {[period ? `Period ${period}` : null, coverage ? `${coverage} coverage` : null]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {limitations?.length ? (
        <Text style={styles.sourceMeta}>Limitations: {limitations.join("; ")}</Text>
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

const styles = StyleSheet.create({
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
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  listTitle: { ...typography.h3, fontSize: 15 },
  listMeta: { ...typography.micro, color: colors.slate500, marginTop: 1 },
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.slate900, paddingVertical: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
