import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The map-tooltip theme contract.
 *
 * The web Rwanda district map rendered its hover card with `bg-forest-deep` and
 * `text-white`. `--c-forest-deep` inverts to a near-white mint in dark mode while
 * `text-white` stays forced white, so the district name and every metric became
 * invisible — white text on a white surface. These assertions pin the fix: the
 * tooltip reads dedicated tokens, those tokens are defined in both themes, and
 * they actually change between them.
 *
 * The map components are client components requiring a DOM, and the web test
 * environment is Node — so this reads the committed source and stylesheet
 * directly, which is exactly the artefact that shipped the bug.
 */
const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const css = read("app/globals.css");
const tooltipSource = read("features/maps/MapTooltip.tsx");
/** Code only: the explanatory header names the old classes on purpose. */
const tooltip = tooltipSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** The `:root { … }` block, up to the dark block. */
const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("html.dark {"));
/** The `html.dark { … }` block, up to the following rule. */
const darkBlock = css.slice(
  css.indexOf("html.dark {"),
  css.indexOf("}", css.indexOf("html.dark {")) + 1,
);

describe("map tooltip theme tokens", () => {
  const tokens = [
    "--tooltip-background",
    "--tooltip-foreground",
    "--tooltip-title",
    "--tooltip-muted",
    "--tooltip-border",
  ];

  it("defines every tooltip token in both themes", () => {
    for (const token of tokens) {
      expect(lightBlock, `:root ${token}`).toContain(`${token}:`);
      expect(darkBlock, `html.dark ${token}`).toContain(`${token}:`);
    }
  });

  it("changes the surface and text colours between themes", () => {
    // If these were equal, one theme would be unreadable by construction.
    for (const token of ["--tooltip-background", "--tooltip-foreground", "--tooltip-title", "--tooltip-muted"]) {
      const light = lightBlock.match(new RegExp(`${token}: ([^;]+);`))?.[1]?.trim();
      const dark = darkBlock.match(new RegExp(`${token}: ([^;]+);`))?.[1]?.trim();
      expect(light, token).toBeTruthy();
      expect(dark, token).toBeTruthy();
      expect(dark, token).not.toBe(light);
    }
  });
});

describe("MapTooltip component", () => {
  it("does not use the theme-inverting brand tokens that caused white-on-white", () => {
    expect(tooltip).not.toContain("bg-forest-deep");
    expect(tooltip).not.toMatch(/\btext-white\b/);
  });

  it("renders the district name with the bold, token-driven title class", () => {
    expect(tooltip).toContain("map-tooltip-title");
    expect(css).toMatch(/\.map-tooltip-title\s*\{[^}]*font-bold/);
  });

  it("drives its surface and text from the tooltip tokens", () => {
    expect(css).toMatch(/\.map-tooltip\s*\{[^}]*--tooltip-background/);
    expect(css).toMatch(/\.map-tooltip\s*\{[^}]*--tooltip-foreground/);
    expect(tooltip).toContain("map-tooltip-value");
  });
});
