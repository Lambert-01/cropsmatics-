import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, radius } from "../theme";

/**
 * Cropmatics brand mark.
 *
 * Rendered from design tokens rather than shipped as a bitmap: react-native-svg
 * is not a dependency, and a PNG would need a new binary asset in the repo for a
 * purely decorative element. It scales cleanly and stays in the brand palette.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Cropmatics Rwanda"
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: colors.forest,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="leaf" size={Math.round(size * 0.55)} color={colors.white} />
    </View>
  );
}

/**
 * Neutral identity placeholder.
 *
 * Deliberately initials, not a stock photograph: there is no user profile or
 * auth in this build, and inventing a person's face would misrepresent who is
 * using the app.
 */
export function InitialsAvatar({ name, size = 30 }: { name?: string | null; size?: number }) {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `Profile: ${name}` : "Profile placeholder"}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.tint,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: "700", color: colors.forest }}>
        {initials || "—"}
      </Text>
    </View>
  );
}
