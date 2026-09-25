import type { Config } from "tailwindcss";

/**
 * Semantic design tokens. Components must use these names, not raw hex values,
 * so the palette changes in one place. Risk is always colour + icon + text.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: "#073D2D",
        "forest-deep": "#032D23",
        primary: "#087F5B",
        success: "#16A34A",
        info: "#2563EB",
        amber: "#D97706",
        danger: "#DC2626",
        // NOTE: do not override Tailwind's default `slate` scale here — the UI
        // relies on slate-50..900. The palette token is exposed as `ink`.
        ink: "#334155",
        surface: "#FFFFFF",
        background: "#F7FAF8",
        // Backwards-compatible aliases used by existing components.
        brand: {
          green: "#087F5B",
          forest: "#073D2D",
          slate: "#334155",
        },
        risk: {
          low: "#16A34A",
          moderate: "#D97706",
          high: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(3, 45, 35, 0.06), 0 1px 3px rgba(3, 45, 35, 0.04)",
        pop: "0 10px 30px rgba(3, 45, 35, 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
