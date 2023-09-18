module.exports = {
    root: true,
    extends: [
        "eslint:recommended",
    ],
    globals: {
        NodeJS: true
    },
    env: {
        browser: true,
        node: true
    },
    parserOptions: {
        "parser": "@typescript-eslint/parser",
        ecmaVersion: 6,
        sourceType: "module",
        ecmaFeatures: {
            jsx: true
        }
    },
    rules: {
        "indent": ["error", 2],
        semi: "error",
        "no-async-promise-executor": "warn",
        "no-void": "off",
        semi: "error",
        eqeqeq: "warn",
        strict: "off",
        quotes: [2, "double", { "avoidEscape": true }],
        "comma-dangle": ["error", "never"],
    }
}