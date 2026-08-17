import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],
  rules: {
    '@systemfsoftware/oxlint-plugin/no-io-boundary-tests': 'error',
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
