import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  overrides: [
    {
      // The Gherkin DSL's `Then`/`Given`/`When` create `it` blocks at runtime via
      // `makeFeature({ it, layer })`, which the vitest plugin's static analysis
      // cannot follow, so it reads `expect` inside a step as standalone. The rule
      // stays at `error`; it is only taught which functions are test blocks.
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
