import { defineConfig } from 'oxlint'

import instrument from '@systemfsoftware/oxlint-preset/instrument'

export default defineConfig({
  extends: [instrument],

  // Consumer-owned ignores (never lint build output or generated trees; oxlint
  // honours .gitignore but these are belt-and-braces for untracked artifacts).
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
