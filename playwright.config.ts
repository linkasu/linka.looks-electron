import { defineConfig } from "@playwright/test";

process.env.NO_PROXY = [process.env.NO_PROXY, "localhost", "127.0.0.1", "::1"]
  .filter(Boolean)
  .join(",");
process.env.no_proxy = [process.env.no_proxy, "localhost", "127.0.0.1", "::1"]
  .filter(Boolean)
  .join(",");

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
