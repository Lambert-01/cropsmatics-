import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { features } from "../config/features";
import { useAppStore } from "../store/useAppStore";
import { makeTypography, palettes, type Palette, type Typography } from "./index";

export type ThemeMode = "light" | "dark";

interface ThemeValue {
  /** The active colour palette. Screens should read colours from here. */
  colors: Palette;
  /** Text styles for the active palette (colours are baked in). */
  typography: Typography;
  mode: ThemeMode;
  /** Whether dark mode is available in this build at all. */
  available: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  colors: palettes.light,
  typography: makeTypography(palettes.light),
  mode: "light",
  available: false,
});

/**
 * Resolves the active colour scheme from the user's preference and the OS.
 *
 * Gated by `features.darkMode`: until every screen reads colours from this
 * context, forcing light keeps the app visually coherent instead of rendering
 * a dark shell around light screens. When the flag is on, `system` follows the
 * device and the explicit `light`/`dark` choices override it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useAppStore((s) => s.settings.appearance);
  const system = useColorScheme();

  const value = useMemo<ThemeValue>(() => {
    if (!features.darkMode) {
      const colors = palettes.light;
      return { colors, typography: makeTypography(colors), mode: "light", available: false };
    }
    const resolved: ThemeMode =
      appearance === "system" ? (system === "dark" ? "dark" : "light") : appearance;
    const colors = palettes[resolved];
    return { colors, typography: makeTypography(colors), mode: resolved, available: true };
  }, [appearance, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Theme-aware style factory result.
 *
 * Usage inside a component:
 *   const { colors, typography } = useTheme();
 *   const styles = useThemedStyles(makeStyles);   // makeStyles(colors, typography)
 *
 * The factory is defined at module scope and the result is memoised on the
 * palette, so a style object is only rebuilt when the scheme actually changes.
 */
export function useThemedStyles<T>(
  factory: (colors: Palette, typography: Typography) => T,
): T {
  const { colors, typography } = useTheme();
  return useMemo(() => factory(colors, typography), [factory, colors, typography]);
}
