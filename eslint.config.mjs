import js from "@eslint/js";
import next from "eslint-config-next";
import globals from "globals";

const config = [
  {ignores: [".next-e2e/**"]},
  js.configs.recommended,
  ...next,
  {
    ignores: [".next/**", ".next-e2e/**", "node_modules/**", "playwright-report/**", "test-results/**"],
    languageOptions: {
      globals: {...globals.browser, ...globals.node},
    },
  },
];

export default config;
