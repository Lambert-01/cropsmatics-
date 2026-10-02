"use client";

import { Moon, Sun } from "lucide-react";

import { usePreferences } from "@/components/providers/PreferencesProvider";

/**
 * Compact light/dark switch for the header.
 *
 * Cycles between the two explicit schemes. The third state (`system`) is only
 * reachable from Settings, so the header control stays a one-tap toggle rather
 * than a menu a reader has to open to darken the screen.
 *
 * It applies `theme` through the same preference pipeline as everything else, so
 * the choice persists and the anti-flash script in `layout.tsx` honours it on
 * the next load.
 */
export function ThemeToggle() {
  const { setPreference, ready, dark: isDark } = usePreferences();

  return (
    <button
      type="button"
      onClick={() => setPreference("theme", isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="btn px-2"
      disabled={!ready}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
