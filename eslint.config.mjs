import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "extraResources/bin/**",
      "test-results/**",
      "playwright-report/**"
    ]
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs["flat/essential"],

  {
    files: ["**/*.{js,mjs,cjs,ts,vue}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        NodeJS: "readonly"
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
    }
  },

  {
    // Vue rules beyond `essential` that catch real defects rather than style.
    // Formatting and attribute order stay out: Prettier owns the first, and the
    // second would rewrite every template for no behavioural gain.
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    },
    rules: {
      "vue/no-unused-components": "warn",
      "vue/no-unused-refs": "warn",
      // Off: every hit is `<template #activator="{ props }">`, which is
      // Vuetify's documented slot contract, not accidental shadowing.
      "vue/no-template-shadow": "off",
      "vue/no-undef-components": "off",
      "vue/require-explicit-emits": "warn",
      "vue/no-useless-v-bind": "warn",
      "vue/no-useless-mustaches": "warn",
      "vue/prefer-separate-static-class": "warn",
      "vue/require-default-prop": "off",
      "vue/multi-word-component-names": "off"
    }
  },

  {
    // Build and CI helpers that Node runs directly as CommonJS.
    files: ["**/*.cjs", "postinstall.js", "scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },

  // Keep last: switches off the stylistic rules Prettier owns.
  prettier
);
