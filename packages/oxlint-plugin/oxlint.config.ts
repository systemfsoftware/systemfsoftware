import { defineConfig } from 'oxlint'

import instrument from '@systemfsoftware/oxlint-preset/instrument'

export default defineConfig({
  extends: [instrument],

  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/lib/**',
    '**/build/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/*.tsbuildinfo',
  ],

  overrides: [
    {
      files: ['oxlint-plugin-test-placement/src/rules/__tests__/_guards.test.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
      },
    },
  ],
})
