import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@frontend': resolve(__dirname, "./src/"),
        '@electron': resolve(__dirname, "./electron/"),
        '@common': resolve(__dirname, "./common/"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@frontend': resolve(__dirname, "./src/"),
        '@electron': resolve(__dirname, "./electron/"),
        '@common': resolve(__dirname, "./common/"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    resolve: {
      alias: {
        '@frontend': resolve(__dirname, "./src/"),
        '@electron': resolve(__dirname, "./electron/"),
        '@common': resolve(__dirname, "./common/"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    }
  }
})
