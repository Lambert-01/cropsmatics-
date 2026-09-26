import { create } from "zustand";

import type { Language } from "../i18n";

interface AppState {
  language: Language;
  pendingSyncCount: number;
  onboardingComplete: boolean;
  setLanguage: (language: Language) => void;
  setPendingSyncCount: (count: number) => void;
  setOnboardingComplete: (complete: boolean) => void;
}

/** Client-only state. Server data lives in React Query, not here. */
export const useAppStore = create<AppState>((set) => ({
  language: "en",
  pendingSyncCount: 0,
  onboardingComplete: false,
  setLanguage: (language) => set({ language }),
  setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
}));
