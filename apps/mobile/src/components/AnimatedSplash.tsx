/**
 * Animated launch splash — the branded hand-off from the native launch window.
 *
 * The native splash (configured in `app.json` and the Android resources) is a
 * static image. This overlay is the moving continuation of it: the same dark
 * brand green (#032D23) and the same Cropmatics mark, now revealed with a short,
 * deliberate animation before the app is shown.
 *
 * Deliberate properties:
 *
 * - **No fake progress.** The bar is a timed reveal of the brand, not a
 *   download meter; the app is already hydrated by the time this runs.
 * - **Reduced motion is honoured.** When the store reports reduced motion the
 *   overlay resolves in one quiet fade instead of an animated sequence.
 * - **It always ends.** Every animation path calls `onDone`, so the overlay can
 *   never be stranded over the app.
 * - **Native driver only.** Every animated property is a transform or an
 *   opacity, so the reveal runs on the UI thread and cannot jank the JS thread
 *   that is finishing the first render.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { strings } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { colors, spacing } from "../theme";

const SPLASH_LOGO = require("../../assets/branding/splash-logo.png");

const BRAND_BACKGROUND = colors.forestDeep; // #032D23
const BRAND_ACCENT = "#8FD14F"; // the splash mark's own bright green

export function AnimatedSplash({
  onDone,
  reducedMotion = false,
}: {
  /** Called once the reveal has finished and the overlay has faded out. */
  onDone: () => void;
  reducedMotion?: boolean;
}) {
  const t = strings(useAppStore((s) => s.language));
  const overlay = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.84)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(12)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = reducedMotion
      ? Animated.sequence([
          Animated.timing(logoOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
          Animated.delay(220),
          Animated.timing(overlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        ])
      : Animated.sequence([
          Animated.parallel([
            Animated.timing(logoOpacity, {
              toValue: 1,
              duration: 520,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(logoScale, {
              toValue: 1,
              friction: 7,
              tension: 70,
              useNativeDriver: true,
            }),
            Animated.timing(glow, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(textOpacity, {
              toValue: 1,
              duration: 420,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(textShift, {
              toValue: 0,
              duration: 420,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(progress, {
              toValue: 1,
              duration: 760,
              easing: Easing.inOut(Easing.quad),
              // A layout property (width), so this one runs on the JS driver.
              useNativeDriver: false,
            }),
          ]),
          Animated.delay(180),
          Animated.timing(overlay, {
            toValue: 0,
            duration: 340,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]);

    sequence.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => sequence.stop();
  }, [glow, logoOpacity, logoScale, onDone, overlay, progress, reducedMotion, textOpacity, textShift]);

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] });
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Cropmatics Rwanda"
      style={[styles.overlay, { opacity: overlay }]}
    >
      {/* Soft radial glow behind the mark: depth without decoration. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      />

      <View style={styles.center}>
        <Animated.Image
          source={SPLASH_LOGO}
          resizeMode="contain"
          style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        />
        <Animated.View
          style={{
            opacity: textOpacity,
            transform: [{ translateY: textShift }],
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text style={styles.wordmark}>Cropmatics</Text>
          <Text style={styles.tagline}>{t.tagline}</Text>
        </Animated.View>
      </View>

      <View style={styles.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <Text style={styles.footer}>{t.splashFooter}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: BRAND_ACCENT,
  },
  center: { alignItems: "center", gap: spacing.lg },
  logo: { width: 168, height: 168 },
  wordmark: {
    color: colors.white,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tagline: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  progressTrack: {
    position: "absolute",
    bottom: 96,
    width: 168,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 999,
    backgroundColor: BRAND_ACCENT,
  },
  footer: {
    position: "absolute",
    bottom: 56,
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
