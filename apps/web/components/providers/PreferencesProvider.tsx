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
}

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  setPreference: () => {},
  updatePreferences: () => {},
  reset: () => {},
  ready: false,
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
function applyDocumentEffects(preferences: Preferences): void {
  setNumberGroupingPreference(preferences.numberGrouping);

  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.reduceMotion = String(preferences.reducedMotion);
  root.dataset.compactTables = String(preferences.compactTables);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  // Read once on mount: localStorage is not available during server rendering.
  useEffect(() => {
    const stored = loadPreferences(window.localStorage);
    setPreferences(stored);
    applyDocumentEffects(stored);
    setReady(true);
  }, []);

  const persist = useCallback((next: Preferences) => {
    setPreferences(next);
    applyDocumentEffects(next);
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
    () => ({ preferences, setPreference, updatePreferences, reset, ready }),
    [preferences, setPreference, updatePreferences, reset, ready],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
