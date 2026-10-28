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
    "install.title": "Install the Cropmatics app",
    "install.subtitle": "Scan the QR code or open this page on your phone to get the offline-first field app.",
    "install.scan": "Scan to install",
    "install.scanHint": "Open the camera app on your Android phone and point it at this code.",
    "install.steps": "Install steps",
    "install.step1": "Open this page on your phone.",
    "install.step2": "Download the APK and allow installation when Android asks.",
    "install.step3": "Open the app. Your records stay on the device until you sync.",
    "install.download": "Download Android APK",
    "install.noLink": "The page is online, but no public APK release is configured yet.",
    "install.noApk": "The public APK is not configured yet. Set the release URL in Vercel before sharing this page.",
    "install.releaseHint": "This button downloads the current public APK release. Android will ask you to approve the installation.",
    "install.apiTitle": "Which data will the app reach?",
    "install.api": "API",
    "install.localApi": "This build uses a local API. Install it while you are on the same Wi-Fi.",
    "install.publicApi": "This build uses the public Cropmatics API and works with any internet connection.",
    "install.compatibilityTitle": "Android compatibility",
    "install.compatibility": "Android 7.0 or newer (API 24+)",
    "install.downloadSource": "Verified APK source",
    "install.parseError": "If Android says the package cannot be parsed, redownload from this page and check that the phone runs Android 7.0 or newer. The APK must remain a .apk file; do not rename or unzip it.",
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
    "install.title": "Shyiraho porogaramu ya Cropmatics",
    "install.subtitle": "Sikana kode cyangwa ufungure uru rupapuro kuri telefoni yawe kugira ngo ubone porogaramu ikora nta murandasi.",
    "install.scan": "Sikana kugira ngo ushyireho",
    "install.scanHint": "Fungura kamera kuri telefoni ya Android uyereke iyi kode.",
    "install.steps": "Intambwe zo kuyishyiraho",
    "install.step1": "Fungura uru rupapuro kuri telefoni yawe.",
    "install.step2": "Kuramo APK wemere kuyishyiraho igihe Android ibigusabye.",
    "install.step3": "Fungura porogaramu. Inyandiko zawe ziguma kuri telefoni kugeza uzihuje.",
    "install.download": "Kuramo APK ya Android",
    "install.noLink": "Uru rupapuro rurakora, ariko nta APK rusange irashyirwaho.",
    "install.noApk": "APK rusange ntirashyirwaho. Shyira umurongo wa release muri Vercel mbere yo gusangiza uru rupapuro.",
    "install.releaseHint": "Iyi buto ikuramo APK rusange igezweho. Android izagusaba kwemeza ko uyishyiraho.",
    "install.apiTitle": "Porogaramu izagera ku yihe makuru?",
    "install.api": "API",
    "install.localApi": "Iyi verisiyo ikoresha API yo kuri murandasi waho. Yikoreshe uri kuri Wi-Fi imwe.",
    "install.publicApi": "Iyi verisiyo ikoresha API rusange ya Cropmatics kandi ikora kuri interineti.",
    "install.compatibilityTitle": "Ibyo telefoni igomba kuba yujuje",
    "install.compatibility": "Android 7.0 cyangwa irenze (API 24+)",
    "install.downloadSource": "Aho APK yemejwe ikurwa",
    "install.parseError": "Niba Android ivuze ko package idashobora gusomwa, ongera uyikure kuri uru rupapuro kandi urebe ko telefoni ifite Android 7.0 cyangwa irenze. APK igomba kuguma ari dosiye .apk; ntuyihindure cyangwa ngo uyifungure.",
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
    "install.title": "Installer l'application Cropmatics",
    "install.subtitle": "Scannez le code QR ou ouvrez cette page sur votre téléphone pour obtenir l'application de terrain utilisable hors ligne.",
    "install.scan": "Scanner pour installer",
    "install.scanHint": "Ouvrez l'appareil photo de votre téléphone Android et visez ce code.",
    "install.steps": "Étapes d'installation",
    "install.step1": "Ouvrez cette page sur votre téléphone.",
    "install.step2": "Téléchargez l'APK et autorisez l'installation lorsque Android le demande.",
    "install.step3": "Ouvrez l'application. Vos enregistrements restent sur le téléphone jusqu'à la synchronisation.",
    "install.download": "Télécharger l'APK Android",
    "install.noLink": "La page est en ligne, mais aucun APK public n'est encore configuré.",
    "install.noApk": "L'APK public n'est pas encore configuré. Ajoutez l'URL de la release dans Vercel avant de partager cette page.",
    "install.releaseHint": "Ce bouton télécharge l'APK public actuel. Android demandera votre autorisation pour l'installation.",
    "install.apiTitle": "À quelles données l'application accédera-t-elle ?",
    "install.api": "API",
    "install.localApi": "Cette version utilise une API locale. Installez-la en étant connecté au même Wi-Fi.",
    "install.publicApi": "Cette version utilise l'API publique Cropmatics et fonctionne avec toute connexion Internet.",
    "install.compatibilityTitle": "Compatibilité Android",
    "install.compatibility": "Android 7.0 ou version ultérieure (API 24+)",
    "install.downloadSource": "Source de l'APK vérifié",
    "install.parseError": "Si Android indique que le package ne peut pas être analysé, téléchargez à nouveau l'APK depuis cette page et vérifiez que le téléphone utilise Android 7.0 ou une version ultérieure. Le fichier doit rester en .apk; ne le renommez pas et ne le décompressez pas.",
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
