// Satu konfigurasi lint untuk seluruh monorepo.
// Lint tidak memakai informasi tipe, jadi bisa jalan sebelum build;
// pemeriksaan tipe dikerjakan oleh `pnpm build` (tsc / vue-tsc).
import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: [
      '*.js',
      'apps/api/**/*.ts',
      'packages/shared/**/*.ts',
      'apps/web/*.config.ts',
      'apps/web/e2e/**/*.ts',
      'apps/web/scripts/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
);
