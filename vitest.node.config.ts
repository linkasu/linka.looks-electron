import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const alias = {
  "@frontend": resolve(__dirname, "src/frontend"),
  "@electron": resolve(__dirname, "src/electron"),
  "@common": resolve(__dirname, "src/common"),
  "@": resolve(__dirname, "src")
};

export default defineConfig({
  resolve: {
    alias
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/frontend/tests/unit/CardsStorage.spec.ts", "src/electron/tests/unit/**/*.spec.ts"],
    setupFiles: ["src/frontend/tests/unit/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/electron/services/card-storage-service.ts"],
      thresholds: {
        branches: 40,
        functions: 40,
        lines: 55,
        statements: 55,
        "src/electron/services/card-storage-service.ts": {
          branches: 40,
          functions: 40,
          lines: 55,
          statements: 55
        }
      }
    }
  }
});
