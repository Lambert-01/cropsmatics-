/**
 * Types for plugins/with-analytical-theme.js.
 *
 * The plugin is plain CommonJS — it has to be, because `expo prebuild` loads it
 * outside any bundler. This declaration gives `tests/android-theme.test.ts` a
 * typed handle on the pure transforms without turning on `allowJs` for the whole
 * app.
 *
 * The constants are declared as properties of the default export rather than as
 * named exports, because that is what the module actually does:
 * `module.exports = withAnalyticalTheme; module.exports.LIGHT_COLORS = ...`.
 */

/**
 * A loosely-typed `res/values/*.xml` document, as xml2js parses it.
 *
 * Carries the resource kinds the tests read. `$` holds the XML attributes, so
 * `style.$` is `name`/`parent` and `string.$` is `name`/`translatable`.
 */
export interface ResourceXML {
  resources?: {
    style?: {
      $: { name: string; parent?: string; translatable?: string };
      item?: { $: { name: string }; _: string }[];
    }[];
    color?: { $: { name: string }; _: string }[];
    string?: { $: { name: string; translatable?: string }; _?: string }[];
  };
}

interface AnalyticalThemePlugin {
  (config: unknown): unknown;

  /** The `values/styles.xml` transform: DayNight parent + light scheme items. */
  applyAppTheme(styles: ResourceXML): ResourceXML;
  /** The splash-theme transform inside `values/styles.xml`. */
  applySplashTheme(styles: ResourceXML): ResourceXML;
  /** Collapse duplicate `AppTheme` groups and set the DayNight parent. */
  applyDayNightParent(styles: ResourceXML): ResourceXML;
  /** Add or overwrite `<color>` entries. */
  applyColorItems(colors: ResourceXML, palette: Record<string, string>): ResourceXML;

  /** App-shell style items applied to `AppTheme` in the light scheme. */
  APP_THEME_ITEMS: Record<string, string>;
  /** Style items applied to `Theme.App.SplashScreen` (brand launch, both schemes). */
  SPLASH_THEME_ITEMS: Record<string, string>;
  /**
   * The complete `AppTheme` written to `values-night/styles.xml` — parent and
   * every item included, because a night style *replaces* the light one rather
   * than merging into it.
   */
  APP_THEME_NIGHT_ITEMS: Record<string, string>;
  /** The edit-field overrides that keep native text legible in both schemes. */
  EDIT_TEXT_ITEMS: Record<string, string>;
  /** Light-scheme colour tokens, mirroring `colors` in src/theme/index.ts. */
  LIGHT_COLORS: Record<string, string>;
  /** Night-scheme colour tokens, mirroring `darkColors`. */
  NIGHT_COLORS: Record<string, string>;
  /** The literal `values-night/styles.xml` the plugin writes. */
  NIGHT_STYLES_XML: string;
  /** The `strings.xml` key expo-system-ui reads at Activity create. */
  USER_INTERFACE_STYLE_KEY: string;
  /** Validates and returns app.json's `userInterfaceStyle`. */
  resolveUserInterfaceStyle(config: {
    userInterfaceStyle?: string;
    android?: { userInterfaceStyle?: string };
  }): string;
}

declare const plugin: AnalyticalThemePlugin;
export default plugin;
