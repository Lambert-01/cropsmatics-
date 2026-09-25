import { en, type Strings } from "./en";
import { rw } from "./rw";

export type Language = "en" | "rw";

const DICTIONARIES: Record<Language, Strings> = { en, rw };

export function strings(lang: Language): Strings {
  return DICTIONARIES[lang] ?? en;
}

export const SUPPORTED_LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "rw", label: "Kinyarwanda" },
];

export { en, rw };
export type { Strings };
