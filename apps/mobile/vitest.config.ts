import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    // Expo's native SecureStore entry imports React Native Flow syntax under
    // Node/Vitest. Production Metro still uses the real module; tests use a
    // tiny in-memory equivalent because the client contract is what is under test.
    alias: {
      "expo-secure-store": resolve(__dirname, "tests/mocks/secure-store.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
