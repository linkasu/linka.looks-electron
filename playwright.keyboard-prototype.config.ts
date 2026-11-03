import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "keyboard-prototype.spec.ts",
  workers: 1,
  fullyParallel: false,
  outputDir: process.env.TYPING_GEOMETRY_OUTPUT || "test-results/keyboard-prototype",
  use: { baseURL: "http://127.0.0.1:5207", channel: "chrome" },
  webServer: {
    command: process.env.TYPING_VITE_COMMAND || "npm run prototype:keyboard -- --port 5207",
    url: "http://127.0.0.1:5207/typing-prototype.html",
    reuseExistingServer: false
  }
});
