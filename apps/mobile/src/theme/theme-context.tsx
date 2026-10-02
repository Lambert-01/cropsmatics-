import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { features } from "../config/features";
import { useAppStore } from "../store/useAppStore";
import { palettes, type Palette } from "./index";

export type ThemeMode = "light" | "dark";

interface ThemeValue {
  /** The active colour palette. Screens should read colours from here. */
  colors: Palette;
  mode: ThemeMode;
  /** Whether dark mode is available in this build at all. */
  available: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  colors: palettes.light,
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
      return { colors: palettes.light, mode: "light", available: false };
    }
    const resolved: ThemeMode =
      appearance === "system" ? (system === "dark" ? "dark" : "light") : appearance;
    return { colors: palettes[resolved], mode: resolved, available: true };
  }, [appearance, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
