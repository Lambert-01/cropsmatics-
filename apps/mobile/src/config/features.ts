/** Feature flags — controlled via environment variables. */
export const features = {
  /** Field operations (harvest registration, risk, storage) — off by default. */
  fieldOperations: process.env.EXPO_PUBLIC_ENABLE_FIELD_OPERATIONS === "true",
  inquiries: true,
  ask: true,
  maps: true,
  savedItems: true,
  /**
   * Dark mode. On by default now that every screen and component reads its
   * colours from the theme context (there are no hard-coded colours outside the
   * palette, so a scheme switch cannot leave a light surface behind). Set
   * EXPO_PUBLIC_ENABLE_DARK_MODE=false to force the light theme for a build
   * without changing code.
   *
   * The value is a string comparison rather than `=== "true"` so an *absent*
   * variable means enabled - the production default - and only an explicit
   * "false" disables it.
   */
  darkMode: process.env.EXPO_PUBLIC_ENABLE_DARK_MODE !== "false",
} as const;
