import { defineConfig, devices } from "@playwright/test";

/**
 * Browser verification for Cropmatics web.
 *
 * These tests drive a *real rendered application*: `next build` + `next start`
 * serving the production bundle, against a live FastAPI instance on :8000
 * (started by this config if it is not already running). Nothing is mocked at
 * the React layer, so a chart that disappears after a filter change — the
 * regression this suite exists for — fails here the way a user would see it.
 *
 * Two projects run the same specs:
 *  - `desktop` emulates Chrome on a desktop viewport;
 *  - `android` emulates a small Samsung-class phone (360×740), because the
 *    responsive layout is a requirement, not a nice-to-have.
 *
 * Run: `npx playwright test` (after `next build`, which the CI script does).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Use the locally installed Google Chrome rather than downloading a
    // browser bundle: this is the browser the platform actually ships with.
    channel: "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "android",
      use: {
        ...devices["Pixel 7"],
        channel: "chrome",
        // A small Samsung-class handset: 360 CSS px wide is the floor the
        // responsive layouts are required to hold.
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command:
        "cd ../../services/api && env PYTHONPATH=. CANONICAL_DATA_MODE=file CORS_ORIGINS=http://localhost:3000 .venv/bin/python -m uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // The production bundle normally requires a public HTTPS API. Browser
      // tests deliberately use the local FastAPI process above, so opt into
      // the explicit local-preview guard instead of inheriting .env.local.
      command:
        "env CROPMATICS_LOCAL_PREVIEW=1 NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 npx next start -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
