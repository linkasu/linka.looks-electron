const { defineConfig } = require("@vue/cli-service");
const { resolve } = require("path");

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      symlinks: false,
      alias: {
        "@frontend": resolve(__dirname, "./src/frontend/"),
        "@electron": resolve(__dirname, "./src/electron/"),
        "@common": resolve(__dirname, "./src/common/"),
        "@": resolve(__dirname, "./src/")
      }
    }
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      mainProcessFile: "src/electron/main.ts",
      rendererProcessFile: "src/frontend/main.ts",
      disableMainProcessTypescript: false, // Manually disable typescript plugin for main process. Enable if you want to use regular js for the main process (src/background.js by default).
      mainProcessTypeChecking: false,
      builderOptions: {
        productName: "LINKa. смотри",
        appId: "su.linka.looks",
        fileAssociations: [{
          ext: "linka"
        }],
        publish: ["github"],
        win: {
          icon: "build/icons/icon.ico",
          publisherName: "LINKa Ltd",
          signingHashAlgorithms: ["sha256"],
          signAndEditExecutable: true,
          verifyUpdateCodeSignature: false
        },
        extraResources: [
          {
            from: "./extraResources/",
            to: "extraResources",
            filter: ["**/*"]
          }
        ]
      }
    }
  }
});
