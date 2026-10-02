"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { setNumberGroupingPreference } from "@/lib/format";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  resetPreferences,
  savePreferences,
  loadPreferences,
  type Preferences,
} from "@/lib/preferences";

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  reset: () => void;
  /** False until the stored values have been read, to avoid a flash of defaults. */
  ready: boolean;
  /** The colour scheme actually in effect, after resolving `system`. */
  dark: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  setPreference: () => {},
  updatePreferences: () => {},
  reset: () => {},
  ready: false,
  dark: false,
});

/**
 * Preferences are applied on two levels.
 *
 * Values that React renders (table density, map labels, whether sources are
 * expanded) are read from context. Values that change global presentation are
 * written to the document element, so they work for CSS and for charts without
 * every component subscribing: `data-reduce-motion` and `data-compact-tables`
 * drive stylesheet rules, and the number-grouping preference is pushed into the
 * shared formatter.
 */
/**
 * Whether the dark theme should be active for a given preference.
 *
 * `system` is resolved from `prefers-color-scheme`; on the server (or a browser
 * without matchMedia) it resolves to light, and the anti-flash script in
 * `layout.tsx` has already set the class before hydration on the client.
 */
export function resolveDarkTheme(theme: Preferences["theme"]): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDocumentEffects(preferences: Preferences): void {
  setNumberGroupingPreference(preferences.numberGrouping);

  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.reduceMotion = String(preferences.reducedMotion);
  root.dataset.compactTables = String(preferences.compactTables);
  root.classList.toggle("dark", resolveDarkTheme(preferences.theme));
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);

  // Read once on mount: localStorage is not available during server rendering.
  useEffect(() => {
    const stored = loadPreferences(window.localStorage);
    setPreferences(stored);
    applyDocumentEffects(stored);
    setDark(resolveDarkTheme(stored.theme));
    setReady(true);
  }, []);

  // When following the system, react to the OS changing its preference live.
  useEffect(() => {
    if (preferences.theme !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      document.documentElement.classList.toggle("dark", query.matches);
      setDark(query.matches);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [preferences.theme]);

  const persist = useCallback((next: Preferences) => {
    setPreferences(next);
    applyDocumentEffects(next);
    setDark(resolveDarkTheme(next.theme));
    savePreferences(window.localStorage, next);
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => persist(mergePreferences(preferences, patch)),
    [persist, preferences],
  );

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
      persist(mergePreferences(preferences, { [key]: value } as Partial<Preferences>)),
    [persist, preferences],
  );

  const reset = useCallback(() => persist(resetPreferences()), [persist]);

  const value = useMemo(
    () => ({ preferences, setPreference, updatePreferences, reset, ready, dark }),
    [preferences, setPreference, updatePreferences, reset, ready, dark],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
