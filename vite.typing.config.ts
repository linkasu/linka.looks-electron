import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

// Browser-only keyboard demos substitute storage, speech and Electron IPC.
export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "electron", replacement: resolve(__dirname, "src/frontend/typing/trackerBridge.ts") },
      {
        find: "@/frontend/store/eStore",
        replacement: resolve(__dirname, "src/frontend/typing/storeBridge.ts")
      },
      {
        find: "@/frontend/utils/TTS",
        replacement: resolve(__dirname, "src/frontend/typing/speechBridge.ts")
      },
      { find: "@", replacement: resolve(__dirname, "src") }
    ]
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: { input: resolve(__dirname, "typing.html") }
  }
});
