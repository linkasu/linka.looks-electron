import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["typing-packaged.spec.ts", "typing-options.spec.ts"],
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  outputDir: "test-results/typing-packaged"
});
