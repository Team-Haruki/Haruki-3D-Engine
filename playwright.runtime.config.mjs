import { defineConfig } from "@playwright/test";

const baseURL = process.env.HARUKI_RUNTIME_E2E_URL;
if (!baseURL) {
  throw new Error("HARUKI_RUNTIME_E2E_URL is required for runtime browser tests.");
}
const workers = Number(process.env.HARUKI_BROWSER_WORKERS ?? 3);

export default defineConfig({
  testDir: "./tests/browser-runtime",
  timeout: 120_000,
  fullyParallel: true,
  workers: Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 3,
  reporter: process.env.CI ? "github" : "line",
  use: { baseURL, headless: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        headless: false,
        firefoxUserPrefs: {
          "webgl.disabled": false,
          "webgl.force-enabled": true,
        },
      },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
