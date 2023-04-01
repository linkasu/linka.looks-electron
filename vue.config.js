const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      symlinks: false
    }
  },
  pluginOptions: {
    electronBuilder: {
      
      externals: ['ultimate-text-to-image'],
      nodeIntegration: true,
      builderOptions: {
        publish: ['github'],
        extraResources: [
          {

            from: "./extraResources/",
            to: "extraResources",
            filter: ["**/*"],
          },
        ],
      }
    },
    
  },
})
