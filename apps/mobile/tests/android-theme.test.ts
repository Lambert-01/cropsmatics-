import { AndroidConfig } from "expo/config-plugins";
import path from "node:path";
import { describe, expect, it } from "vitest";

import plugin, { type ResourceXML } from "../plugins/with-analytical-theme";

/**
 * The Android theme contract.
 *
 * These assertions guard the specific ways a dark-mode-capable Android theme
 * silently degrades. Every one of them was a real defect in this app:
 *
 *   - a Light-only `AppTheme` parent, which makes `res/values-night/` inert and
 *     stops `AppCompatDelegate.setDefaultNightMode()` — the whole mechanism
 *     `expo-system-ui` uses to implement `userInterfaceStyle` — from having any
 *     effect, so `useColorScheme()` could never report `dark`;
 *   - a white status bar and a white navigation bar in dark mode;
 *   - a light launch window in dark mode, i.e. a white flash on open;
 *   - a `values-night` `AppTheme` with no `parent`, which drops the AppCompat
 *     theme in dark mode and crashes `AppCompatActivity.onCreate` on launch.
 *
 * The committed `android/` tree is what EAS and CI actually compile, and
 * `plugins/with-analytical-theme.js` is what re-applies the same values on
 * `expo prebuild`. So these tests read the committed files, push them through
 * the plugin's transforms, and assert both halves agree.
 */

/**
 * Vitest is configured with `apps/mobile` as its root, so the native resources
 * are addressed from the process working directory rather than from this test
 * file. `import.meta` is unavailable at the current `module` setting.
 */
const res = (kind: string, name: string) =>
  path.join(process.cwd(), "android", "app", "src", "main", "res", kind, name);

const readXml = (file: string) =>
  AndroidConfig.Resources.readResourcesXMLAsync({ path: file }) as Promise<ResourceXML>;

/** A `<style>` group's `<item>`s as a name -> value map. */
function itemsOf(styles: ResourceXML, name: string): Record<string, string> {
  const group = (styles.resources?.style ?? []).find((style) => style.$.name === name);
  const items = group?.item ?? [];
  return Object.fromEntries(items.map((item) => [item.$.name, item._]));
}

/** A colours file's `<color>`s as a name -> value map. */
function colorsOf(colors: ResourceXML): Record<string, string> {
  return Object.fromEntries((colors.resources?.color ?? []).map((c) => [c.$.name, c._]));
}

/** A strings file's `<string>`s as a name -> value map. */
function stringsOf(xml: ResourceXML): Record<string, string> {
  return Object.fromEntries((xml.resources?.string ?? []).map((s) => [s.$.name, s._ ?? ""]));
}

/**
 * Rough channel ratio of a `#rrggbb` literal: 0 is black, 1 is white.
 *
 * Not perceptual luminance — it only needs to separate a dark surface from a
 * light one, which is what every "is this token dark?" assertion here asks.
 */
function hexLuminance(hex: string): number {
  return parseInt(hex.slice(1), 16) / 0xffffff;
}

/**
 * The `values/styles.xml` shape `expo prebuild` actually generates: a Light
 * parent, no DayNight, no bar resources.
 *
 * Reading the committed file is not sufficient on its own — it has already been
 * through this plugin, so a transform that fails to rewrite the parent still
 * appears to pass. Every assertion below starts from this instead, which is what
 * a fresh prebuild hands the plugin.
 */
const generatedLightStyles = (): ResourceXML => ({
  resources: {
    style: [
      {
        $: { name: "AppTheme", parent: "Theme.AppCompat.Light.NoActionBar" },
        item: [
          { $: { name: "android:textColor" }, _: "@android:color/black" },
          { $: { name: "android:editTextStyle" }, _: "@style/ResetEditText" },
          { $: { name: "android:editTextBackground" }, _: "@drawable/rn_edit_text_material" },
          { $: { name: "colorPrimary" }, _: "@color/colorPrimary" },
          { $: { name: "android:statusBarColor" }, _: "#ffffff" },
        ],
      },
      {
        $: { name: "ResetEditText", parent: "@android:style/Widget.EditText" },
        item: [{ $: { name: "android:textColor" }, _: "@android:color/black" }],
      },
      {
        $: { name: "Theme.App.SplashScreen", parent: "AppTheme" },
        item: [{ $: { name: "android:windowBackground" }, _: "@drawable/splashscreen" }],
      },
    ],
  },
});

describe("android AppTheme", () => {
  it("rewrites the generated Light parent to DayNight", () => {
    const styles = plugin.applyAppTheme(generatedLightStyles());
    const appTheme = (styles.resources?.style ?? []).find((s) => s.$.name === "AppTheme");
    expect(appTheme?.$.parent).toBe("Theme.AppCompat.DayNight.NoActionBar");
  });

  it("sets parent as an attribute, not as a stray child element", () => {
    // Regression: assigning `group.parent` instead of `group.$.parent` produces
    // <style ...><parent>…</parent></style> and never changes the real parent,
    // so a fresh prebuild keeps the Light theme and dark mode silently dies.
    const styles = plugin.applyAppTheme(generatedLightStyles());
    const appTheme = (styles.resources?.style ?? []).find((s) => s.$.name === "AppTheme");
    expect(Object.hasOwn(appTheme ?? {}, "parent")).toBe(false);
    // Re-serialised, the group must carry the attribute and no <parent> child.
    const xml = JSON.stringify(appTheme);
    expect(xml).toContain('"parent":"Theme.AppCompat.DayNight.NoActionBar"');
    expect(xml).not.toContain('"parent":"Theme.AppCompat.DayNight.NoActionBar","_"');
  });

  it("overwrites the template's literal status bar colour", () => {
    // The generated file hardcodes #ffffff (from androidStatusBar/splash), which
    // no values-night entry could ever override.
    const styles = plugin.applyAppTheme(generatedLightStyles());
    const items = itemsOf(styles, "AppTheme");
    expect(items["android:statusBarColor"]).toBe("@color/status_bar");
    expect(items["android:textColor"]).toBe("@color/app_text");
  });

  it("descends from a DayNight parent so values-night can resolve", async () => {
    const styles = plugin.applyAppTheme(await readXml(res("values", "styles.xml")));
    const appTheme = (styles.resources?.style ?? []).find((s) => s.$.name === "AppTheme");
    expect(appTheme?.$.parent).toBe("Theme.AppCompat.DayNight.NoActionBar");
  });

  it("keeps exactly one AppTheme group when prebuild runs twice", async () => {
    const once = plugin.applyAppTheme(await readXml(res("values", "styles.xml")));
    const twice = plugin.applyAppTheme(once);
    const groups = (twice.resources?.style ?? []).filter((s) => s.$.name === "AppTheme");
    expect(groups).toHaveLength(1);
    expect(groups[0].$.parent).toBe("Theme.AppCompat.DayNight.NoActionBar");
  });

  it("routes the bars and the window through colour resources, not literals", async () => {
    const styles = plugin.applyAppTheme(await readXml(res("values", "styles.xml")));
    const items = itemsOf(styles, "AppTheme");
    // A literal hex here is unthemeable: values-night could never override it.
    expect(items["android:statusBarColor"]).toBe("@color/status_bar");
    expect(items["android:navigationBarColor"]).toBe("@color/nav_bar");
    expect(items["android:windowBackground"]).toBe("@color/app_background");
    expect(items["android:textColor"]).toBe("@color/app_text");
  });

  it("asks for dark icons in the light scheme", async () => {
    const styles = plugin.applyAppTheme(await readXml(res("values", "styles.xml")));
    const items = itemsOf(styles, "AppTheme");
    expect(items["android:windowLightStatusBar"]).toBe("true");
    expect(items["android:windowLightNavigationBar"]).toBe("true");
  });

  it("flips to light icons in the night scheme", async () => {
    const styles = await readXml(res("values-night", "styles.xml"));
    const items = itemsOf(styles, "AppTheme");
    expect(items["android:windowLightStatusBar"]).toBe("false");
    expect(items["android:windowLightNavigationBar"]).toBe("false");
  });
});

/**
 * Dark mode used to crash the app on launch.
 *
 * Android resolves a style against exactly one configuration: a `<style>` in
 * `values-night/` *replaces* its `values/` counterpart outright rather than
 * merging into it. The night file therefore used to be a two-item style with
 * no `parent`, which in night mode meant the activity theme was not an
 * AppCompat theme at all — `AppCompatActivity.onCreate` threw
 * "You need to use a Theme.AppCompat theme (or descendant) with this
 * activity", and the OS killed the process. Reproduced on device as a
 * zero-second cold start with `FATAL EXCEPTION` under `main`.
 *
 * The day file alone proves nothing: `values/styles.xml` carries a correct
 * parent even when the night one does not, because they are independent
 * resource entries, not an inheritance chain.
 */
describe("android night AppTheme", () => {
  /** The `<style>` group itself, so `parent` can be asserted alongside items. */
  const styleGroup = (styles: ResourceXML, name: string) =>
    (styles.resources?.style ?? []).find((style) => style.$.name === name);

  it("keeps an AppCompat parent in the night scheme", async () => {
    const group = styleGroup(await readXml(res("values-night", "styles.xml")), "AppTheme");
    expect(group?.$.parent).toBe("Theme.AppCompat.DayNight.NoActionBar");
  });

  it("declares the whole style in both schemes, not a subset", async () => {
    const day = itemsOf(await readXml(res("values", "styles.xml")), "AppTheme");
    const night = itemsOf(await readXml(res("values-night", "styles.xml")), "AppTheme");
    // A style resolved in night mode is exactly what values-night declares, so
    // any key present in values/ but missing here simply vanishes in dark mode.
    expect(Object.keys(night).sort()).toEqual(Object.keys(day).sort());
  });

  it("differs from the light style only in the system-bar icon flags", async () => {
    const day = itemsOf(await readXml(res("values", "styles.xml")), "AppTheme");
    const night = itemsOf(await readXml(res("values-night", "styles.xml")), "AppTheme");
    const flips = ["android:windowLightStatusBar", "android:windowLightNavigationBar"];
    for (const key of flips) {
      expect(day[key], key).toBe("true");
      expect(night[key], key).toBe("false");
    }
    for (const key of Object.keys(day)) {
      if (flips.includes(key)) continue;
      // Everything else must be identical — the colours already resolve
      // per-scheme through values-night/colors.xml.
      expect(night[key], key).toBe(day[key]);
    }
  });

  it("points the night window at a colour the night scheme actually defines", async () => {
    const night = itemsOf(await readXml(res("values-night", "styles.xml")), "AppTheme");
    const tokens = colorsOf(await readXml(res("values-night", "colors.xml")));
    const token = /^@color\/(\w+)$/.exec(night["android:windowBackground"] ?? "")?.[1];
    expect(token, "windowBackground must be a @color reference").toBeDefined();
    // A day-only token resolves in night mode to its light value, which is a
    // white window behind a dark UI — the very flash this theme exists to kill.
    expect(Object.keys(tokens), token).toContain(token);
    expect(hexLuminance(tokens[token!]), token).toBeLessThan(0.5);
  });

  it("generates that same file on prebuild", async () => {
    // The committed file is what EAS compiles; NIGHT_STYLES_XML is what
    // `expo prebuild` would write. They must be the same style, or the fix
    // below only holds until the next prebuild.
    const committed = itemsOf(await readXml(res("values-night", "styles.xml")), "AppTheme");
    const generated = Object.fromEntries(
      [...plugin.NIGHT_STYLES_XML.matchAll(/<item name="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(
      plugin.NIGHT_STYLES_XML,
      "the plugin must emit an AppCompat parent or prebuild reintroduces the crash",
    ).toContain('name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar"');
    expect(generated).toEqual(plugin.APP_THEME_NIGHT_ITEMS);
    expect(generated).toEqual(committed);
  });
});

describe("system appearance", () => {
  /**
   * The most load-bearing assertion in this file.
   *
   * `expo-system-ui` ships `light` as the library default for this resource and
   * feeds it straight to `AppCompatDelegate.setDefaultNightMode()`. `android/` is
   * committed, so EAS Build never runs the config plugin that would rewrite it
   * from app.json — meaning app.json alone changes nothing in the shipped APK.
   * If this ever reads `light` again, dark mode is dead on device even though
   * every setting in the app says otherwise.
   */
  it("tells Android to follow the system, not to pin light", async () => {
    const strings = stringsOf(await readXml(res("values", "strings.xml")));
    expect(strings[plugin.USER_INTERFACE_STYLE_KEY]).toBe("automatic");
  });

  it("keeps the override non-translatable", async () => {
    const xml = await readXml(res("values", "strings.xml"));
    const entry = (xml.resources?.string ?? []).find(
      (s) => s.$.name === plugin.USER_INTERFACE_STYLE_KEY,
    );
    // A translated copy would resolve per device locale and could pin light on
    // some of them; this is a machine token, not copy.
    expect(entry?.$.translatable).toBe("false");
  });

  it("reads the mode from app.json, with a safe fallback", () => {
    expect(plugin.resolveUserInterfaceStyle({ userInterfaceStyle: "automatic" })).toBe("automatic");
    expect(
      plugin.resolveUserInterfaceStyle({ android: { userInterfaceStyle: "dark" } }),
    ).toBe("dark");
    // app.json is the source of truth, but a missing value must not fall back to
    // `light` — that is the failure mode being fixed.
    expect(plugin.resolveUserInterfaceStyle({})).toBe("automatic");
    expect(() => plugin.resolveUserInterfaceStyle({ userInterfaceStyle: "sepia" })).toThrow();
  });
});

describe("android colour tokens", () => {
  it("defines the same tokens in both schemes", async () => {
    const light = colorsOf(await readXml(res("values", "colors.xml")));
    const night = colorsOf(await readXml(res("values-night", "colors.xml")));
    const themed = Object.keys(plugin.LIGHT_COLORS);
    // Every token the bars reference must exist in both schemes. A missing
    // night token is what a resource lookup falls back to the light value for,
    // which is how a dark UI ends up with a white bar.
    for (const token of themed) {
      expect(Object.keys(light), `values/${token}`).toContain(token);
      expect(Object.keys(night), `values-night/${token}`).toContain(token);
    }
  });

  it("agrees with the plugin's own palettes", async () => {
    const light = colorsOf(await readXml(res("values", "colors.xml")));
    const night = colorsOf(await readXml(res("values-night", "colors.xml")));
    for (const [token, value] of Object.entries(plugin.LIGHT_COLORS)) {
      expect(light[token], `values/${token}`).toBe(value);
    }
    for (const [token, value] of Object.entries(plugin.NIGHT_COLORS)) {
      expect(night[token], `values-night/${token}`).toBe(value);
    }
  });

  it("actually changes scheme, except where it must not", async () => {
    const light = colorsOf(await readXml(res("values", "colors.xml")));
    const night = colorsOf(await readXml(res("values-night", "colors.xml")));
    expect(night.app_background).not.toBe(light.app_background);
    expect(night.status_bar).not.toBe(light.status_bar);
    expect(night.nav_bar).not.toBe(light.nav_bar);
    expect(night.app_text).not.toBe(light.app_text);
  });

  it("keeps the launch window brand-dark in both schemes", async () => {
    const light = colorsOf(await readXml(res("values", "colors.xml")));
    const night = colorsOf(await readXml(res("values-night", "colors.xml")));
    // A light launch window under a dark scheme is the white flash on open.
    expect(night.splashscreen_background).toBe(light.splashscreen_background);
    expect(night.splashscreen_background).toBe("#032D23");
    expect(light.app_background).not.toBe(light.splashscreen_background);
  });

  it("gives the dark scheme a dark surface, not a light one", async () => {
    const night = colorsOf(await readXml(res("values-night", "colors.xml")));
    // Night bars and windows must be closer to black than to white.
    for (const token of ["app_background", "status_bar", "nav_bar"]) {
      expect(hexLuminance(night[token]), token).toBeLessThan(0.5);
    }
    // And the dark-scheme text must be light, or the dark surfaces are
    // unreadable.
    expect(hexLuminance(night.app_text)).toBeGreaterThan(0.5);
  });
});
