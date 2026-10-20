import { defineConfig } from "@playwright/test";

// The browser: PLAYWRIGHT_CHROMIUM points at an installed Chromium. Without it, Playwright uses its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;

export default defineConfig({
  testDir: "e2e",
  // The galaxy renders in software when there is no GPU, so a flight can take a while.
  timeout: 180_000,
  expect: { timeout: 120_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "npm run build && PORT=3100 node server.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
