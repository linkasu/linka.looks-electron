const { defineConfig } = require("@vue/cli-service");
const { resolve } = require("path");

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      symlinks: false,
      alias: {
        '@frontend': resolve('./src/frontend'),
        '@electron': resolve('./src/electron'),
        '@common': resolve('./src/common'),
      }
    },
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      builderOptions: {
        productName: 'LINKa. смотри',
        appId: 'su.linka.looks',
        fileAssociations: [{
          ext: 'linka'
        }],
        publish: ["github"],
        win: {
          "icon": "build/icons/icon.ico",
          "publisherName": "LINKa Ltd",
          signingHashAlgorithms: ['sha256'],
          signAndEditExecutable: true,
          verifyUpdateCodeSignature: false
        },
        extraResources: [
          {
            from: "./extraResources/",
            to: "extraResources",
            filter: ["**/*"],
          },
        ],
      },
    },
  },
});
