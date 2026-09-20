import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  overrides: [
    {
      files: ['**/src/**', '**/*.test.ts'],
      rules: {
        'unicorn/prefer-node-protocol': 'error',
      },
    },
  ],
})
