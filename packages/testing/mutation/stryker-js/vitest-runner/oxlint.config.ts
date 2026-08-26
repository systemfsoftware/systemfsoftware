import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...all,
  ignorePatterns: [...(all.ignorePatterns ?? []), '**/testResources/**'],
  overrides: [
    ...(all.overrides ?? []),
    {
      // The Gherkin DSL's `Then`/`Given`/`When` create `it` blocks at runtime
      // via `makeFeature({ it, layer })` → `scenario` → `Then`. The vitest
      // plugin's static analysis cannot follow this indirection and reports
      // `expect` inside `Then` as standalone. Teach the rule that these
      // Gherkin steps are test blocks.
      files: ['tests/**/*.integration.test.ts'],
      rules: {
        'vitest/no-standalone-expect': [
          'error',
          { additionalTestBlockFunctions: ['Then', 'Given', 'When', 'And'] },
        ],
      },
    },
  ],
})
