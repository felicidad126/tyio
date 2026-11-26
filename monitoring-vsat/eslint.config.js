import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "worker-configuration.d.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Pustaka komponen bersama (shadcn/ui dan komponen NPR) sengaja juga
    // mengekspor fungsi bantu (mis. buttonVariants, waktu, urutkan).
    files: ["src/components/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
