module.exports = {
    root: true,
    extends: [
        "@electron-internal",
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:vue/base",
        // "vue-preset/vue/vue3-recommended-e"
    ],
    globals: {
        NodeJS: true
    },
    env: {
        browser: true,
        node: true
    },
    parser: "vue-eslint-parser",
    parserOptions: {
        "parser": "@typescript-eslint/parser",
        ecmaVersion: 6,
        sourceType: "module",
        ecmaFeatures: {
            jsx: true
        }
    },
    rules: {
        semi: "error",
        eqeqeq: "warn",
        strict: "off",
        quotes: [2, "double", { "avoidEscape": true }],
        "comma-dangle": ["error", "never"],
    }
}