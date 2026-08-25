import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  overrides: [
    {
      files: ['tests/**/*.test.ts'],
      rules: {
        'vitest/no-standalone-expect': [
          'error',
          { additionalTestBlockFunctions: ['Then', 'Given', 'When', 'And'] },
        ],
      },
    },
  ],
})
