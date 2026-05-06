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
    include: ["src/frontend/tests/unit/**/*.spec.ts"]
  },
  clearScreen: false
}));
