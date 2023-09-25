import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@frontend": resolve(__dirname, "./src/renderer/src/"),
        "@electron": resolve(__dirname, "./electron/"),
        "@common": resolve(__dirname, "./common/")
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@frontend": resolve(__dirname, "./src/renderer/src/"),
        "@electron": resolve(__dirname, "./electron/"),
        "@common": resolve(__dirname, "./common/")
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    plugins: [vue()],
    resolve: {
      alias: {
        "@frontend": resolve(__dirname, "./src/renderer/src/"),
        "@electron": resolve(__dirname, "./electron/"),
        "@common": resolve(__dirname, "./common/")
      }
    }
  }
});
