import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { Language } from "../i18n";
import type { CompareSelection } from "../utils/selection";
import { EMPTY_COMPARE_SELECTION } from "../utils/selection";

const LANGUAGE_KEY = "cropmatics.language";
const ONBOARDING_KEY = "cropmatics.hasCompletedOnboarding";
const SETTINGS_KEY = "cropmatics.settings";

export interface AppearanceSettings {
  appearance: "system" | "light" | "dark";
  reducedMotion: boolean;
  largerText: boolean;
  offlineCacheEnabled: boolean;
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  appearance: "system",
  reducedMotion: false,
  largerText: false,
  offlineCacheEnabled: true,
  notificationsEnabled: false,
};

interface AppState {
  language: Language;
  pendingSyncCount: number;
  onboardingComplete: boolean;
  hydrated: boolean;
  settings: AppearanceSettings;
  /**
   * The compare workspace's last selection. In memory on purpose: it exists so
   * leaving Compare and returning (or arriving from a quick-comparison deep
   * link) does not discard the user's picks, not to survive an app restart —
   * a stale persisted comparison would silently show results the user no
   * longer asked for.
   */
  compareSelection: CompareSelection;
  setLanguage: (language: Language) => void;
  setPendingSyncCount: (count: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
  updateSettings: (patch: Partial<AppearanceSettings>) => void;
  setCompareSelection: (next: CompareSelection) => void;
  hydrate: () => Promise<void>;
}

/** Client-only state. Server data lives in React Query, not here. */
export const useAppStore = create<AppState>((set, get) => ({
  language: "en",
  pendingSyncCount: 0,
  onboardingComplete: false,
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  compareSelection: EMPTY_COMPARE_SELECTION,
  setLanguage: (language) => {
    set({ language });
    void AsyncStorage.setItem(LANGUAGE_KEY, language);
  },
  setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
  setOnboardingComplete: (onboardingComplete) => {
    set({ onboardingComplete });
    void AsyncStorage.setItem(ONBOARDING_KEY, onboardingComplete ? "true" : "false");
  },
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
  setCompareSelection: (compareSelection) => set({ compareSelection }),
  hydrate: async () => {
    try {
      const [language, onboarding, settings] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
      ]);
      set({
        language: language === "rw" ? "rw" : "en",
        onboardingComplete: onboarding === "true",
        settings: settings
          ? { ...DEFAULT_SETTINGS, ...(JSON.parse(settings) as Partial<AppearanceSettings>) }
          : DEFAULT_SETTINGS,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
}));
