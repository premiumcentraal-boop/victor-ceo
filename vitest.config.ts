import { defineConfig } from "vitest/config";

// Unit tests only. The browser specs in e2e/ run under Playwright.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
  },
});
