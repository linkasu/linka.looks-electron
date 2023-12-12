// old: (copy node_modules\\eyelog\\bin .\\extraResources\\bin\\ || cp -rf node_modules/eyelog/bin extraResources) && electron-builder install-app-deps
const fs = require('fs')
const { join } = require('path')

const SOURCE = join(__dirname, 'node_modules/eyelog/bin/')
const TARGET = join(__dirname, 'extraResources/bin/')

if(!fs.existsSync(TARGET)){
    fs.mkdirSync(TARGET)
}

const files = fs.readdirSync(SOURCE)

for (const file of files) {
    const source = join(SOURCE, file)
    const target = join(TARGET, file)
    fs.copyFileSync(source, target)
}