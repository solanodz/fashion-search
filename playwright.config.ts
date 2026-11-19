import { defineConfig, devices } from "@playwright/test";

// Not 3000: E2E tests need a build with the stub encoder, separate from a
// running `npm run dev` (Next allows one dev server per project).
const port = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

/**
 * E2E tests run against a production build in CI (`npm run build` first) and
 * against the dev server locally. Set E2E_BASE_URL to test a deployed preview.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? `npm run start -- --port ${port}`
          : `npm run build && npm run start -- --port ${port}`,
        url: baseURL,
        env: { NEXT_PUBLIC_CLIP_STUB: "1" },
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
