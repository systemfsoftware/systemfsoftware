import { MESSAGE } from './path.config.js'

export const MISSING_MAKE_FEATURE_NAME = 'a behaviour test without makeFeature' as const
export const MISSING_MAKE_FEATURE_EXPECTED = 'makeFeature imported from @systemfsoftware/effect-gherkin-spec' as const
export const MISSING_MAKE_FEATURE_ACTUAL =
  'a test that imports @systemfsoftware/effect-gherkin-spec but never constructs a Gherkin feature' as const
export const MISSING_MAKE_FEATURE_FIX =
  'import { makeFeature } from @systemfsoftware/effect-gherkin-spec and declare `const Feature = makeFeature({ it, layer })`' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test that imports @systemfsoftware/effect-gherkin-spec (the behaviour lane) drives its suite through makeFeature from that package.',
  },
  schema: [],
  messages: {
    missingMakeFeature: MESSAGE,
  },
} as const
