import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "typing-caret.spec.ts",
  workers: 1,
  timeout: 120000,
  outputDir: process.env.CARET_OUTPUT || "test-results/caret",
  use: { baseURL: "http://127.0.0.1:5218", channel: "chrome" },
  webServer: {
    command: "npm run prototype:keyboard -- --port 5218",
    url: "http://127.0.0.1:5218/typing.html",
    reuseExistingServer: false
  }
});
