import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import pkg from "./package.json";

const external = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ...Object.keys(pkg.dependencies || {}),
  "original-fs",
  "eyelog/dist/TobiiProcess",
  "eyelog/dist/bound"
];

const alias = {
  "@frontend": resolve(__dirname, "src/frontend"),
  "@electron": resolve(__dirname, "src/electron"),
  "@common": resolve(__dirname, "src/common"),
  "@": resolve(__dirname, "src")
};

export default defineConfig(({ command }) => ({
  resolve: {
    alias
  },
  plugins: [
    vue(),
    electron({
      main: {
        entry: "src/electron/main.ts",
        vite: {
          resolve: {
            alias
          },
          build: {
            outDir: "dist-electron",
            sourcemap: command === "serve",
            minify: command === "build",
            rollupOptions: {
              external
            }
          }
        }
      },
      renderer: {}
    }),
    renderer()
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/frontend/tests/unit/**/*.spec.ts"],
    exclude: ["src/frontend/tests/unit/CardsStorage.spec.ts"],
    setupFiles: ["src/frontend/tests/unit/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/common/**/*.ts", "src/frontend/**/*.{ts,vue}"],
      exclude: [
        "src/**/*.d.ts",
        "src/frontend/tests/**",
        "src/frontend/main.ts"
      ],
      thresholds: {
        branches: 18,
        functions: 15,
        lines: 22,
        statements: 21,
        "src/common/interfaces/ConfigFile.ts": {
          branches: 80,
          functions: 100,
          lines: 100,
          statements: 95
        },
        "src/frontend/store/index.ts": {
          branches: 60,
          functions: 80,
          lines: 80,
          statements: 80
        },
        "src/frontend/utils/TTS.ts": {
          branches: 70,
          functions: 85,
          lines: 90,
          statements: 85
        },
        "src/frontend/utils/editorLogic.ts": {
          branches: 75,
          functions: 100,
          lines: 90,
          statements: 90
        },
        "src/frontend/utils/setGameLogic.ts": {
          branches: 90,
          functions: 100,
          lines: 100,
          statements: 100
        },
        "src/frontend/components/EyeButton.vue": {
          branches: 80,
          functions: 100,
          lines: 100,
          statements: 85
        },
        "src/frontend/components/OutputLine.vue": {
          branches: 40,
          functions: 65,
          lines: 85,
          statements: 75
        },
        "src/frontend/components/SetGrid.vue": {
          branches: 60,
          functions: 50,
          lines: 80,
          statements: 75
        }
      }
    }
  },
  clearScreen: false
}));
