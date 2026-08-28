import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...all,
  ignorePatterns: [...(all.ignorePatterns ?? []), '**/testResources/**'],
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
