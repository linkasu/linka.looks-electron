const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      symlinks: false,
    },
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,

      builderOptions: {
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
