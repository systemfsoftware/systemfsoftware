import { MESSAGE } from './path.config.js'

export const FOREIGN_RUNNER_NAME = '<specifier>' as const
export const FOREIGN_RUNNER_EXPECTED = 'it and layer imported from @systemfsoftware/effect-gherkin-spec' as const
export const FOREIGN_RUNNER_ACTUAL =
  'a test runner imported directly from vitest or @effect/vitest in a feature file' as const
export const FOREIGN_RUNNER_FIX =
  'import { it, layer } from @systemfsoftware/effect-gherkin-spec and build the suite with makeFeature({ it, layer })' as const

export const MISSING_MAKE_FEATURE_NAME = 'a *.feature.test.ts without makeFeature' as const
export const MISSING_MAKE_FEATURE_EXPECTED = 'makeFeature imported from @systemfsoftware/effect-gherkin-spec' as const
export const MISSING_MAKE_FEATURE_ACTUAL = 'a feature file that never constructs a Gherkin feature' as const
export const MISSING_MAKE_FEATURE_FIX =
  'import { makeFeature } from @systemfsoftware/effect-gherkin-spec and declare `const Feature = makeFeature({ it, layer })`' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.feature.test.ts must drive its suite through makeFeature from @systemfsoftware/effect-gherkin-spec and must not import test runners from vitest or @effect/vitest.',
  },
  schema: [],
  messages: {
    foreignRunner: MESSAGE,
    missingMakeFeature: MESSAGE,
  },
} as const
