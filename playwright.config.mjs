import { defineConfig, devices } from "@playwright/test";

/** All API traffic is routed to a deliberately unreachable mock origin.
 * Each browser test installs its own route handler; no live POS credentials. */
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.mjs",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      ...process.env,
      VITE_API_URL: "http://127.0.0.1:8765",
      BASE_PATH: "/",
      // Isolated fixture identities only; the mock API never contacts production.
      VITE_REVENUE_SHARE_CHUCK_USER_ID: "901",
      VITE_REVENUE_SHARE_NORI_USER_ID: "902",
    },
  },
});
