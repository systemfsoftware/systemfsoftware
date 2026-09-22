import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['tests/e2e/vitest.e2e.config.ts', 'src/**/__tests__/**'],
  overrides: [
    {
      files: [
        'src/config/**',
        'src/compiler/**',
        'src/collector/**',
        'src/analyzer/**',
        'src/generators/**',
      ],
      rules: {
        complexity: ['error', { max: 20, variant: 'modified' }],
      },
    },
  ],
})
