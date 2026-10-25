import { en, type Strings } from "./en";
import { fr } from "./fr";
import { rw } from "./rw";

export type Language = "en" | "rw" | "fr";

const DICTIONARIES: Record<Language, Strings> = { en, rw, fr };

export function strings(lang: Language): Strings {
  return DICTIONARIES[lang] ?? en;
}

export const SUPPORTED_LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "rw", label: "Kinyarwanda" },
  { code: "fr", label: "Français" },
];

export { en, rw, fr };
export type { Strings };
