import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/packaged",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["html", { open: "never", outputFolder: "packaged-report" }]],
  outputDir: "packaged-results"
});
