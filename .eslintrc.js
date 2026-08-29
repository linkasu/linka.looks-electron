module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:vue/base",
    // "vue-preset/vue/vue3-recommended-e"
    // Keep last: switches off the stylistic rules Prettier now owns.
    "prettier"
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
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "no-async-promise-executor": "warn",
    "no-void": "off",
    eqeqeq: "warn",
    strict: "off",
    camelcase: "off"
  },
  overrides: [
    {
      // Build and CI helpers that Node runs directly as CommonJS.
      files: ["*.cjs", "postinstall.js", "scripts/**/*.js"],
      parser: "espree",
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "script"
      },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off"
      }
    }
  ]
};
