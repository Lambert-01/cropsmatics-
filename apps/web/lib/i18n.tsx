"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "rw" | "fr";

/**
 * Minimal shell i18n. It covers navigation and chrome labels. Analytical
 * source names and methods stay in their published language by design.
 */
export const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.crops": "Crops",
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
    "search.placeholder": "Search crops, districts, datasets…",
    "search.results": "Search results",
    "search.noResults": "No matches",
    "search.kind.crop": "Crop",
    "search.kind.district": "District",
    "search.kind.dataset": "Dataset",
    "header.scope": "Scope",
    "header.clearScope": "Clear scope",
  },
  rw: {
    "nav.overview": "Incamake",
    "nav.crops": "Ibihingwa",
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
    "search.placeholder": "Shakisha ibihingwa, uturere, amakuru…",
    "search.results": "Ibisubizo",
    "search.noResults": "Nta bisubizo",
    "search.kind.crop": "Igihingwa",
    "search.kind.district": "Akarere",
    "search.kind.dataset": "Amakuru",
    "header.scope": "Urwego",
    "header.clearScope": "Siba urwego",
  },
  fr: {
    "nav.overview": "Vue d'ensemble",
    "nav.crops": "Cultures",
    "nav.productivity": "Productivité",
    "nav.yield-intelligence": "Intelligence des rendements",
    "nav.interventions": "Interventions",
    "nav.post-harvest": "Après-récolte",
    "nav.storage": "Stockage et agrégation",
    "nav.markets": "Marchés",
    "nav.maps": "Cartes",
    "nav.reports": "Rapports",
    "nav.data-explorer": "Explorateur de données",
    "nav.transparency": "Données et modèles",
    "nav.assistant": "Assistant IA",
    "nav.settings": "Paramètres",
    "nav.install": "Obtenir l'application",
    "group.Intelligence": "Intelligence",
    "group.Operations": "Opérations",
    "group.Geography & data": "Géographie et données",
    "group.Workspace": "Espace de travail",
    "search.placeholder": "Rechercher des cultures, districts, jeux de données…",
    "search.results": "Résultats de recherche",
    "search.noResults": "Aucun résultat",
    "search.kind.crop": "Culture",
    "search.kind.district": "District",
    "search.kind.dataset": "Jeu de données",
    "header.scope": "Périmètre",
    "header.clearScope": "Effacer le périmètre",
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
    if (stored === "rw" || stored === "fr" || stored === "en") {
      setLangState(stored);
      document.documentElement.lang = stored;
    }
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
