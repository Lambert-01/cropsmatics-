/** Feature flags — controlled via environment variables. */
export const features = {
  /** Field operations (harvest registration, risk, storage) — off by default. */
  fieldOperations: process.env.EXPO_PUBLIC_ENABLE_FIELD_OPERATIONS === "true",
  inquiries: true,
  ask: true,
  maps: true,
  savedItems: true,
  darkMode: false, // scaffolded, not yet fully implemented
} as const;
