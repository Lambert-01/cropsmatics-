import { Text, View } from "react-native";

import { colors, radius, spacing } from "../theme";

export type DataBadgeKind =
  | "official_national"
  | "verified_program"
  | "scenario_input"
  | "not_verified"
  | "facility_unavailable";

const STYLES: Record<DataBadgeKind, { label: string; color: string; background: string }> = {
  official_national: {
    label: "OFFICIAL NATIONAL DATA",
    color: colors.brandGreen,
    background: colors.tint,
  },
  verified_program: { label: "VERIFIED PROGRAM CONTEXT", color: colors.info, background: "#e8effd" },
  scenario_input: { label: "SCENARIO INPUT", color: colors.amber, background: "#fdf3e3" },
  not_verified: { label: "NOT VERIFIED", color: colors.amber, background: "#fdf3e3" },
  facility_unavailable: {
    label: "FACILITY-LEVEL DATA: NOT AVAILABLE",
    color: colors.muted,
    background: colors.background,
  },
};

/** Provenance badge: which layer of data a block belongs to. */
export function DataBadge({ kind }: { kind: DataBadgeKind }) {
  const spec = STYLES[kind];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: spec.background,
        borderWidth: 1,
        borderColor: spec.color,
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: "700", color: spec.color, letterSpacing: 0.4 }}>
        {spec.label}
      </Text>
    </View>
  );
}
