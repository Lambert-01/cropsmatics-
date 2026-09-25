"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "rw";

/**
 * Minimal shell i18n. It covers navigation and chrome labels; Kinyarwanda
 * strings are working translations and need native review before release.
 * Analytical content (source names, methods) stays in English by design.
 */
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.productivity": "Productivity",
    "nav.yield-intelligence": "Yield Intelligence",
    "nav.interventions": "Interventions",
    "nav.post-harvest": "Post-Harvest",
    "nav.storage": "Storage & Aggregation",
    "nav.markets": "Markets",
    "nav.maps": "Maps",
    "nav.reports": "Reports",
    "nav.data-explorer": "Data Explorer",
    "nav.transparency": "Data & Models",
    "nav.assistant": "AI Assistant",
    "nav.settings": "Settings",
    "nav.install": "Get the app",
    "group.Intelligence": "Intelligence",
    "group.Operations": "Operations",
    "group.Geography & data": "Geography & data",
    "group.Workspace": "Workspace",
    "search.placeholder": "Search districts, crops, indicators…",
    "header.season": "Season",
    "header.crop": "Crop",
    "header.district": "District",
    "header.all": "All",
    "header.notifications": "Notifications",
    "header.profile": "Profile",
  },
  rw: {
    "nav.overview": "Incamake",
    "nav.productivity": "Umusaruro",
    "nav.yield-intelligence": "Ubwenge bw'umusaruro",
    "nav.interventions": "Ibikorwa",
    "nav.post-harvest": "Nyuma y'isarura",
    "nav.storage": "Ububiko n'ikoranyabikoresho",
    "nav.markets": "Amasoko",
    "nav.maps": "Ikarita",
    "nav.reports": "Raporo",
    "nav.data-explorer": "Ikubura ry'amakuru",
    "nav.transparency": "Amakuru n'ubwenge",
    "nav.assistant": "Umufasha wa AI",
    "nav.settings": "Igenamiterere",
    "nav.install": "Fata porogaramu",
    "group.Intelligence": "Ubwenge",
    "group.Operations": "Ibikorwa",
    "group.Geography & data": "Ikarita n'amakuru",
    "group.Workspace": "Icyumba cy'akazi",
    "search.placeholder": "Shakisha uturere, ibihingwa, ibipimo…",
    "header.season": "Igihe",
    "header.crop": "Igihingwa",
    "header.district": "Akarere",
    "header.all": "Byose",
    "header.notifications": "Amatangazo",
    "header.profile": "Umwirondoro",
  },
};

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => DICT.en[key] ?? key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("cropmatics-lang");
    if (stored === "rw" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem("cropmatics-lang", next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: string) => DICT[lang][key] ?? DICT.en[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
