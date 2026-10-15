import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
export default defineConfig({
  testDir: "./e2e",
  testMatch: "forecast.spec.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "/private/tmp/cropmatics-forecast-browser",
  use: { baseURL: "http://127.0.0.1:3107", channel: "chrome", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "mobile-web", use: { ...devices["Pixel 7"], channel: "chrome", viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "env PYTHONPATH=services/api CANONICAL_DATA_MODE=file CORS_ORIGINS=http://127.0.0.1:3107 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8007",
      cwd: root, url: "http://127.0.0.1:8007/api/v1/health", timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "env NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8007/api/v1 pnpm --filter cropmatics-web dev --hostname 127.0.0.1 --port 3107",
      cwd: root, url: "http://127.0.0.1:3107", timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
