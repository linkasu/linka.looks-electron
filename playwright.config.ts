import { defineConfig } from "@playwright/test";

process.env.NO_PROXY = [process.env.NO_PROXY, "localhost", "127.0.0.1", "::1"]
  .filter(Boolean)
  .join(",");
process.env.no_proxy = [process.env.no_proxy, "localhost", "127.0.0.1", "::1"]
  .filter(Boolean)
  .join(",");

const e2eDevServerUrl = process.env.E2E_DEV_SERVER_URL || "http://localhost:5174";
const e2eRemoteDebuggingPort = process.env.E2E_REMOTE_DEBUGGING_PORT || "9322";
const e2eDevServerPort = new URL(e2eDevServerUrl).port || "5174";

process.env.E2E_DEV_SERVER_URL = e2eDevServerUrl;
process.env.E2E_REMOTE_DEBUGGING_PORT = e2eRemoteDebuggingPort;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: `npm run serve -- --host localhost --port ${e2eDevServerPort} --strictPort`,
    env: {
      ELECTRON_REMOTE_DEBUGGING_PORT: e2eRemoteDebuggingPort
    },
    url: e2eDevServerUrl,
    reuseExistingServer: false,
    timeout: 30000
  }
});
