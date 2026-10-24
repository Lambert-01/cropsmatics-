import type { Config } from "tailwindcss";

/**
 * Semantic design tokens. Components must use these names, not raw hex values,
 * so the palette changes in one place. Risk is always colour + icon + text.
 *
 * Every semantic token resolves to a CSS variable (see `app/globals.css`), so a
 * single `html.dark` class re-themes the whole application — including the
 * `.card`, `.btn`, `.chip`, `.input` and table primitives — without editing a
 * single component. Brand accents (`forest`, `forest-deep`, `primary`) are also
 * variable-driven because they are used for *text and borders*, not only for
 * solid fills, and dark text must become light on a dark surface.
 *
 * `white` is deliberately NOT remapped: `bg-white/10` is used as a translucent
 * overlay on the already-dark sidebar, and inverting it there would make it
 * disappear. Solid `bg-white` surfaces are re-themed by explicit dark rules in
 * `globals.css` instead.
 */
const rgb = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: rgb("forest"),
        "forest-deep": rgb("forest-deep"),
        primary: rgb("primary"),
        success: rgb("success"),
        info: rgb("info"),
        amber: rgb("amber"),
        "amber-800": rgb("amber-800"),
        "green-800": rgb("green-800"),
        "blue-800": rgb("blue-800"),
        danger: rgb("danger"),
        ink: rgb("ink"),
        surface: rgb("surface"),
        background: rgb("background"),
        // The full slate ramp is variable-driven so `text-slate-*`, `border-slate-*`
        // and `bg-slate-*` all invert together in dark mode.
        slate: {
          50: rgb("slate-50"),
          100: rgb("slate-100"),
          200: rgb("slate-200"),
          300: rgb("slate-300"),
          400: rgb("slate-400"),
          500: rgb("slate-500"),
          600: rgb("slate-600"),
          700: rgb("slate-700"),
          800: rgb("slate-800"),
          900: rgb("slate-900"),
          950: rgb("slate-950"),
        },
        // Backwards-compatible aliases used by existing components.
        brand: {
          green: rgb("primary"),
          forest: rgb("forest"),
          slate: rgb("ink"),
        },
        risk: {
          low: rgb("risk-low"),
          moderate: rgb("risk-moderate"),
          high: rgb("risk-high"),
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
