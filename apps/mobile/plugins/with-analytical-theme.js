/**
 * Cropmatics — Android analytical theme.
 *
 * Makes the native Android surface agree with the JS theme system in
 * `src/theme/`, in all three appearance modes (Light / Dark / System).
 *
 * WHY THIS IS A PLUGIN, NOT A HAND EDIT
 * -------------------------------------
 * `expo prebuild` regenerates `android/app/src/main/res` from app.json, and the
 * `AppTheme` it generates always descends from `Theme.AppCompat.Light.NoActionBar`.
 * That matters because of how `expo-system-ui` actually works: it reads the
 * `expo_system_ui_user_interface_style` string resource (written from
 * `userInterfaceStyle` in app.json) and calls
 * `AppCompatDelegate.setDefaultNightMode()`:
 *
 *     "automatic" -> MODE_NIGHT_FOLLOW_SYSTEM
 *     "light"     -> MODE_NIGHT_NO
 *     "dark"      -> MODE_NIGHT_YES
 *
 * Two consequences follow, and both were live bugs:
 *
 *   1. With `userInterfaceStyle: "light"`, the delegate is pinned to
 *      MODE_NIGHT_NO, so React Native's `useColorScheme()` can never report
 *      `dark` and the in-app "System" appearance option is dead.
 *   2. `setDefaultNightMode` only has any effect when the activity theme is a
 *      `*DayNight*` theme. Under a Light-only parent, the whole of
 *      `res/values-night/` is inert — which is why a dark UI still shipped a
 *      white status bar and a white navigation bar.
 *
 * Recording the fix here means it survives a prebuild.
 *
 * THE TWO WINDOWS
 * ---------------
 *   Launch / splash window (`Theme.App.SplashScreen`)
 *     Brand green in BOTH schemes. The splash mark is a bright green on
 *     transparency, so a fixed dark-green launch is the deliberate branded
 *     start rather than a flash. Being identical in both schemes is what
 *     removes the white flash when the device (or the preference) is dark.
 *
 *   App shell (`AppTheme`)
 *     light : white bars, dark bar icons, #F7FAF8 window
 *     night : #111C18 bars, light bar icons, #07140F window
 *
 * At runtime the bars are then re-asserted from the resolved JS theme, which is
 * what covers an explicit Light/Dark choice that disagrees with the operating
 * system. The native theme alone can only ever follow the OS.
 */

const fs = require("fs");
const path = require("path");

const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
  withDangerousMod,
  withStringsXml,
} = require("expo/config-plugins");

const { assignColorValue } = AndroidConfig.Colors;
const { assignStylesValue, getStyleParent } = AndroidConfig.Styles;
const { buildResourceItem } = AndroidConfig.Resources;
const { setStringItem } = AndroidConfig.Strings;

/**
 * The `strings.xml` key `expo-system-ui` reads at Activity create.
 *
 * Worth restating, because it is the single most load-bearing value here: the
 * library ships `<string name="expo_system_ui_user_interface_style">light</string>`
 * as its own default, and that default is what silently disables dark mode. It
 * has to be overridden in the app's own `strings.xml` — app.json's
 * `userInterfaceStyle` only reaches the resource through a config plugin, i.e.
 * on `expo prebuild`. `android/` is committed in this repo, so EAS Build does
 * not prebuild and therefore never applies it.
 */
const USER_INTERFACE_STYLE_KEY = "expo_system_ui_user_interface_style";

const APP_THEME = { name: "AppTheme" };
const SPLASH_THEME = { name: "Theme.App.SplashScreen" };
const EDIT_TEXT_THEME = { name: "ResetEditText" };

/** Matches `colors` in src/theme/index.ts. */
const LIGHT_COLORS = {
  app_background: "#F7FAF8",
  app_surface: "#FFFFFF",
  status_bar: "#FFFFFF",
  nav_bar: "#FFFFFF",
  /** colors.slate900 — native text (dialogs, selection handles, edit fields). */
  app_text: "#0F172A",
  /** colors.forestDeep — the branded launch surface, same as the splash. */
  splashscreen_background: "#032D23",
};

/** Matches `darkColors` in src/theme/index.ts. */
const NIGHT_COLORS = {
  app_background: "#07140F",
  app_surface: "#111C18",
  status_bar: "#111C18",
  nav_bar: "#111C18",
  /** darkColors.slate900. */
  app_text: "#F1F5F9",
  /** Deliberately NOT the light splash colour: a light launch window in dark
   *  mode is exactly the white flash this plugin exists to remove. */
  splashscreen_background: "#032D23",
};

/**
 * App-shell style items.
 *
 * `android:windowLightStatusBar` / `...NavigationBar` = true means *dark*
 * system-bar icons, i.e. the light scheme. The night override in
 * `values-night/styles.xml` flips them to false.
 */
const APP_THEME_ITEMS = {
  "android:windowBackground": "@color/app_background",
  "android:statusBarColor": "@color/status_bar",
  "android:navigationBarColor": "@color/nav_bar",
  "android:windowLightStatusBar": "true",
  "android:windowLightNavigationBar": "true",
  /* The template hardcodes @android:color/black here. On a DayNight theme that
     leaves the native text-selection menu and dialog text black-on-near-black
     in dark mode. */
  "android:textColor": "@color/app_text",
};

/** The template pins edit-field text to black; repoint it at the same token. */
const EDIT_TEXT_ITEMS = {
  "android:textColor": "@color/app_text",
};

/**
 * Launch-window style items. Brand green with light icons in both schemes, so
 * the moment between the tap and the first React Native frame is coherent.
 */
const SPLASH_THEME_ITEMS = {
  "android:windowBackground": "@drawable/splashscreen",
  "android:statusBarColor": "@color/splashscreen_background",
  "android:navigationBarColor": "@color/splashscreen_background",
  "android:windowLightStatusBar": "false",
  "android:windowLightNavigationBar": "false",
};

/**
 * The complete night `AppTheme`.
 *
 * This is *not* just the flipped system-bar flags, and that distinction is the
 * whole reason dark mode used to crash. Android resolves a style against
 * exactly one configuration: a `<style>` in `values-night/` replaces its
 * `values/` counterpart outright, it does not merge into it. So a night style
 * that declares only two items really is a two-item style at runtime — no
 * parent, no bar colours, no window background.
 *
 * Without `parent="Theme.AppCompat.DayNight.NoActionBar"` the theme stopped
 * being an AppCompat theme in dark mode and `AppCompatActivity.onCreate` threw
 * "You need to use a Theme.AppCompat theme (or descendant) with this
 * activity", killing the app on launch the moment the phone went dark.
 *
 * Every colour token already resolves per-scheme through
 * `res/values-night/colors.xml`, so the values below match the light theme
 * verbatim; only `windowLight*` (dark system-bar icons) flips to false. The
 * items carried over from the Expo template (`editTextBackground`,
 * `colorPrimary`, `enforceNavigationBarContrast`) are restated too — they are
 * part of the style, so omitting them would silently drop them in dark mode.
 */
const APP_THEME_NIGHT_ITEMS = {
  "android:enforceNavigationBarContrast": "true",
  "android:editTextBackground": "@drawable/rn_edit_text_material",
  "colorPrimary": "@color/colorPrimary",
  "android:statusBarColor": "@color/status_bar",
  "android:windowBackground": "@color/app_background",
  "android:navigationBarColor": "@color/nav_bar",
  "android:windowLightStatusBar": "false",
  "android:windowLightNavigationBar": "false",
  "android:textColor": "@color/app_text",
};

/**
 * Extra XML attributes some night items need beside their name/value.
 *
 * `android:enforceNavigationBarContrast` only exists from API 29, so the same
 * `tools:targetApi` marker the light theme carries is required here — lint
 * runs as part of `assembleRelease`, and an unmarked framework reference is a
 * `NewApi` finding.
 */
const NIGHT_ITEM_ATTRS = {
  "android:enforceNavigationBarContrast": ' tools:targetApi="29"',
};

const NIGHT_STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Generated by plugins/with-analytical-theme.js — do not edit by hand.

  Night AppTheme. Mirrors values/styles.xml item-for-item: only the system-bar
  icon flags flip, and every colour token resolves through
  res/values-night/colors.xml.

  It must stay a *complete* style, parent included. Android resolves a style
  against exactly one configuration — a \`<style>\` in values-night/ replaces
  its values/ counterpart outright rather than merging into it — so anything
  omitted here is simply absent in dark mode. Omitting \`parent\` is what
  shipped the dark-mode crash: with no AppCompat parent the activity theme
  stopped being an AppCompat theme and AppCompatActivity.onCreate threw
  "You need to use a Theme.AppCompat theme (or descendant) with this
  activity".
-->
<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
${Object.entries(APP_THEME_NIGHT_ITEMS)
  .map(
    ([name, value]) =>
      `    <item name="${name}"${NIGHT_ITEM_ATTRS[name] ?? ""}>${value}</item>`,
  )
  .join("\n")}
  </style>
</resources>
`;

/**
 * The pre-Android-12 launch window.
 *
 * `Theme.App.SplashScreen` points `android:windowBackground` here (see
 * SPLASH_THEME_ITEMS), which is what a device below API 31 shows while the
 * process starts. Expo SDK 54 stopped generating this drawable — its splash
 * plugin now only emits the API 31+ `windowSplashScreenAnimatedIcon` resources —
 * so a bare reference to `@drawable/splashscreen` fails the AAPT link with
 * "resource drawable/splashscreen not found".
 *
 * Writing it from the plugin keeps the branded launch window on older devices
 * and makes the plugin independent of which splash resources the SDK emits.
 * `splashscreen_logo` is guaranteed to exist: every splash-capable Expo SDK
 * emits it (as a density-specific PNG from SDK 54 onward).
 */
const SPLASH_DRAWABLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Generated by plugins/with-analytical-theme.js — do not edit by hand.

  Brand-green launch surface with the Cropmatics mark centred, shown on devices
  below Android 12. The logo is drawn at its intrinsic density size rather than
  scaled to the density bucket, which keeps the mark a sane size on every screen
  without upscaling.
-->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background"/>
  <item>
    <bitmap
      android:src="@drawable/splashscreen_logo"
      android:gravity="center"/>
  </item>
</layer-list>
`;

/**
 * Collapse duplicate `AppTheme` groups and point the survivor at DayNight.
 *
 * Expo's own Android plugins look `AppTheme` up as
 * `{ name: 'AppTheme', parent: 'Theme.AppCompat.Light.NoActionBar' }`. Once
 * this plugin has changed the parent to DayNight, that lookup no longer matches
 * and their `setStylesItem` helper *creates a second* `<style name="AppTheme">`
 * instead of extending the first. `expo prebuild` is routinely run without
 * `--clean`, so that is reachable, and a duplicated style silently drops
 * whichever half Android resolves second. Collapsing here — this plugin runs
 * after the Expo ones — keeps prebuild idempotent.
 *
 * Matched on name alone (`group.parent` is undefined) so this works whether the
 * incoming file is the generated Light parent or an already-fixed DayNight one.
 */
function applyDayNightParent(styles) {
  const groups = styles?.resources?.style;
  if (Array.isArray(groups)) {
    const appThemes = groups.filter((group) => group?.$?.name === APP_THEME.name);
    if (appThemes.length > 1) {
      // Keep the richest copy; the extras are the empty shells Expo appended.
      const survivor = appThemes.reduce((best, next) =>
        (next.item?.length ?? 0) > (best.item?.length ?? 0) ? next : best,
      );
      styles.resources.style = groups.filter(
        (group) => group?.$?.name !== APP_THEME.name || group === survivor,
      );
    }
  }

  const group = getStyleParent(styles, APP_THEME);
  if (group) {
    /*
     * `parent` is an *attribute* on <style>, so it lives in xml2js's `$` bag.
     * Assigning `group.parent` instead (the obvious-looking mistake) sets an
     * unrelated own property, which xml2js then serialises as a stray
     * `<parent>` child element inside <style> — and leaves the real attribute
     * untouched. On a fresh prebuild that silently keeps the Light parent, so
     * AppCompatDelegate stays in MODE_NIGHT_NO and dark mode is dead again.
     */
    group.$.parent = "Theme.AppCompat.DayNight.NoActionBar";
    // Defensive: drop the stray property if an older build of this plugin left
    // one on the parsed object, so a re-run cleans up rather than persisting it.
    delete group.parent;
  }
  return styles;
}

/** Add or overwrite a set of `<item>`s on one style group. */
function applyStyleItems(styles, group, items) {
  return Object.entries(items).reduce(
    (xml, [name, value]) => assignStylesValue(xml, { add: true, parent: group, name, value }),
    styles,
  );
}

/** Add or overwrite a set of `<color>`s. */
function applyColorItems(colors, palette) {
  return Object.entries(palette).reduce(
    (xml, [name, value]) => assignColorValue(xml, { name, value }),
    colors,
  );
}

/** The full light-scheme styles.xml transform, exposed for the unit test. */
function applyAppTheme(styles) {
  const withParent = applyDayNightParent(styles);
  return applyStyleItems(
    applyStyleItems(withParent, APP_THEME, APP_THEME_ITEMS),
    EDIT_TEXT_THEME,
    EDIT_TEXT_ITEMS,
  );
}

/** The splash style transform, exposed for the unit test. */
function applySplashTheme(styles) {
  return applyStyleItems(styles, SPLASH_THEME, SPLASH_THEME_ITEMS);
}

/** The configured appearance mode, validated against what Android can express. */
function resolveUserInterfaceStyle(config) {
  const style = config.android?.userInterfaceStyle ?? config.userInterfaceStyle ?? "automatic";
  if (!["automatic", "light", "dark"].includes(style)) {
    throw new Error(
      `with-analytical-theme: userInterfaceStyle must be automatic|light|dark, got "${style}"`,
    );
  }
  return style;
}

const withAnalyticalTheme = (config) => {
  // Mirrors app.json's userInterfaceStyle into the resource the Android runtime
  // actually reads, so a prebuild cannot regress to expo-system-ui's `light`.
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = setStringItem(
      [
        buildResourceItem({
          name: USER_INTERFACE_STYLE_KEY,
          value: resolveUserInterfaceStyle(cfg),
          translatable: false,
        }),
      ],
      cfg.modResults,
    );
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    cfg.modResults = applySplashTheme(applyAppTheme(cfg.modResults));
    return cfg;
  });

  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = applyColorItems(cfg.modResults, LIGHT_COLORS);
    return cfg;
  });

  config = withAndroidColorsNight(config, (cfg) => {
    cfg.modResults = applyColorItems(cfg.modResults, NIGHT_COLORS);
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resDir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/values-night");
      await fs.promises.mkdir(resDir, { recursive: true });
      await fs.promises.writeFile(path.join(resDir, "styles.xml"), NIGHT_STYLES_XML, "utf8");

      // Re-create the pre-Android-12 launch-window drawable that SDK 54's splash
      // plugin no longer emits (see SPLASH_DRAWABLE_XML). Without it, the
      // `android:windowBackground` in SPLASH_THEME_ITEMS references a missing
      // resource and the resource link fails.
      const drawableDir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      await fs.promises.mkdir(drawableDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(drawableDir, "splashscreen.xml"),
        SPLASH_DRAWABLE_XML,
        "utf8",
      );
      return cfg;
    },
  ]);

  return config;
};

module.exports = withAnalyticalTheme;
module.exports.applyAppTheme = applyAppTheme;
module.exports.applySplashTheme = applySplashTheme;
module.exports.applyColorItems = applyColorItems;
module.exports.applyDayNightParent = applyDayNightParent;
module.exports.APP_THEME_NIGHT_ITEMS = APP_THEME_NIGHT_ITEMS;
module.exports.EDIT_TEXT_ITEMS = EDIT_TEXT_ITEMS;
module.exports.NIGHT_STYLES_XML = NIGHT_STYLES_XML;
module.exports.SPLASH_DRAWABLE_XML = SPLASH_DRAWABLE_XML;
module.exports.USER_INTERFACE_STYLE_KEY = USER_INTERFACE_STYLE_KEY;
module.exports.resolveUserInterfaceStyle = resolveUserInterfaceStyle;
module.exports.LIGHT_COLORS = LIGHT_COLORS;
module.exports.NIGHT_COLORS = NIGHT_COLORS;
module.exports.APP_THEME_ITEMS = APP_THEME_ITEMS;
module.exports.SPLASH_THEME_ITEMS = SPLASH_THEME_ITEMS;
