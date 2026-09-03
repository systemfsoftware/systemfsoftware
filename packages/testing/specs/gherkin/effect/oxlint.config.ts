import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-placement')],
  rules: {
    '@systemfsoftware/oxlint-plugin-test-placement/eviction-purity': 'error',
    '@systemfsoftware/oxlint-plugin-test-placement/in-source-test-laws-only': 'error',
    'yoda': 'error',
  },

  overrides: [
    {
      files: ['src/**'],
      rules: {
        'no-ternary': 'error',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**'],
      rules: {
        'no-empty-function': 'off',
        'no-shadow': 'off',
        'no-ternary': 'off',
        'require-await': 'off',
        'require-yield': 'off',
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-deprecated': 'off',
      },
    },
  ],
})
