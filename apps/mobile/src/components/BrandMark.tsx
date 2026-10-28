import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, ImageSourcePropType, Text, View } from "react-native";

import { radius } from "../theme";
import { useTheme } from "../theme/theme-context";

const BRAND_MARK_ASSET = require("../../assets/branding/cropmatics-logo-mark.png");
const BRAND_HEADER_ASSET = require("../../assets/branding/cropmatics-logo-header.png");

export type BrandMarkSize = "small" | "medium" | "large" | "hero";
export type BrandMarkVariant = "mark-only" | "horizontal-brand";

interface BrandMarkProps {
  size?: number | BrandMarkSize;
  variant?: BrandMarkVariant;
}

const SIZE_MAP: Record<BrandMarkSize, number> = {
  small: 28,
  medium: 38,
  large: 56,
  hero: 96,
};

/**
 * Cropmatics brand mark component.
 *
 * Renders the approved canonical Cropmatics logo mark from cropmaticlogo.png derivatives.
 * Provides fallback to brand-colored stylized leaf icon only if image asset fails.
 */
export function BrandMark({ size = "medium", variant = "mark-only" }: BrandMarkProps) {
  const { colors } = useTheme();
  const [loadFailed, setLoadFailed] = useState(false);

  const numericSize = typeof size === "number" ? size : SIZE_MAP[size] ?? 38;

  if (variant === "horizontal-brand") {
    const h = numericSize;
    const w = Math.round(h * 3.2);

    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="Cropmatics"
        style={{ width: w, height: h, justifyContent: "center" }}
      >
        {!loadFailed ? (
          <Image
            source={BRAND_HEADER_ASSET as ImageSourcePropType}
            style={{ width: w, height: h }}
            resizeMode="contain"
            onError={() => setLoadFailed(true)}
          />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: h * 0.8,
                height: h * 0.8,
                borderRadius: radius.md,
                backgroundColor: colors.forest,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="leaf" size={Math.round(h * 0.45)} color={colors.white} />
            </View>
            <Text style={{ fontWeight: "700", color: colors.forestDeep, fontSize: h * 0.45 }}>
              Cropmatics
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Cropmatics logo mark"
      style={{
        width: numericSize,
        height: numericSize,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {!loadFailed ? (
        <Image
          source={BRAND_MARK_ASSET as ImageSourcePropType}
          style={{ width: numericSize, height: numericSize }}
          resizeMode="contain"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <View
          style={{
            width: numericSize,
            height: numericSize,
            borderRadius: radius.md,
            backgroundColor: colors.forest,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="leaf" size={Math.round(numericSize * 0.55)} color={colors.white} />
        </View>
      )}
    </View>
  );
}

/**
 * Neutral identity placeholder.
 *
 * App is anonymous-first. Deliberately neutral initials/icon rather than a fake portrait.
 */
export function InitialsAvatar({ name, size = 30 }: { name?: string | null; size?: number }) {
  const { colors } = useTheme();
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
        backgroundColor: colors.mintSoft,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initials ? (
        <Text style={{ fontSize: size * 0.38, fontWeight: "700", color: colors.forestDeep }}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="person-outline" size={size * 0.5} color={colors.slate700} />
      )}
    </View>
  );
}

