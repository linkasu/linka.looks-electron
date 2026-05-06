import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "npm run serve -- --host localhost",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
