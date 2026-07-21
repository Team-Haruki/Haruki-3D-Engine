import { defineConfig } from "@playwright/test";

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: "npm run preview:capture -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/capture.html",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: chromiumExecutable
        ? { launchOptions: { executablePath: chromiumExecutable } }
        : {},
    },
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
