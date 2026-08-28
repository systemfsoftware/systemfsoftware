import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  // Fixture projects are input data for the reuse-path gatekeeper, not source —
  // their JS calculator is intentionally untyped so the engine has something to
  // mutate. Ignoring the fixture directory reflects a genuine fixture-data
  // boundary, not a weakened check on source.
  ignorePatterns: [...(all.ignorePatterns ?? []), 'tests/__fixtures__/reuse-project/**'],
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
