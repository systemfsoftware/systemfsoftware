import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_SUFFIX_EXPECTED = 'exactly *.integration.test.ts or *.feature.test.ts outside src/' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'an unsanctioned test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  'rename it *.integration.test.ts for a sociable sandwich test, *.feature.test.ts for a Gherkin scenario; a property test belongs in src/ beside its cell' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Outside src/, test files must end .integration.test.ts or .feature.test.ts; every other suffix is unsanctioned by the testing-trophy matrix.',
  },
  schema: [],
  messages: {
    unsanctionedSuffix: MESSAGE,
  },
} as const
