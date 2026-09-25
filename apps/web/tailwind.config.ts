import type { Config } from "tailwindcss";

/**
 * Semantic design tokens. Components must use these names, not raw hex values,
 * so the palette can change in one place. Risk is always colour + icon + text.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#087f5b",
          forest: "#0b3d2e",
          slate: "#334155",
        },
        risk: {
          low: "#16a34a",
          moderate: "#d97706",
          high: "#dc2626",
        },
        info: "#2563eb",
      },
    },
  },
  plugins: [],
};

export default config;
