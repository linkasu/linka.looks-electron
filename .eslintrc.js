module.exports = {
  root: true,
  extends: [
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
    parser: "@typescript-eslint/parser",
    ecmaVersion: 6,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    indent: ["error", 2, { SwitchCase: 1 }],
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "no-async-promise-executor": "warn",
    "no-void": "off",
    semi: "error",
    eqeqeq: "warn",
    strict: "off",
    quotes: [2, "double", { avoidEscape: true }],
    "comma-dangle": ["error", "never"],
    camelcase: "off",
    "func-call-spacing": "off"
  }
};
