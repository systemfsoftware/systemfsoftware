import { MESSAGE } from './path.config.js'

export const TOO_FEW_FEATURES_NAME = 'a *.integration.test.ts that constructs no Feature' as const
export const TOO_FEW_FEATURES_EXPECTED = 'exactly one Feature(...) — the capability the file proves' as const
export const TOO_FEW_FEATURES_ACTUAL = 'a behaviour file with zero Feature(...) calls' as const
export const TOO_FEW_FEATURES_FIX =
  'one file, one capability. A Feature is what the file is for; if there is none, the file is not a behaviour test — delete it or add the missing Feature call.' as const

export const TOO_MANY_FEATURES_NAME = 'a *.integration.test.ts accumulating multiple Feature(...) calls' as const
export const TOO_MANY_FEATURES_EXPECTED =
  'exactly one Feature(...) — every additional one signals a junk drawer' as const
export const TOO_MANY_FEATURES_ACTUAL = 'a behaviour file with two or more Feature(...) calls' as const
export const TOO_MANY_FEATURES_FIX =
  'splitting a junk drawer into several smaller junk drawers is not an improvement. When separating scenarios surfaces assertions that restate a pure function return value — change detectors against a lookup table or constant — those get deleted, not rehoused. Each surviving capability keeps its own file with exactly one Feature.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.integration.test.ts must contain exactly one Feature(...) call. Zero or two-or-more is the junk-drawer signal that produced 41 scenarios of pure-function assertions in a single file.',
  },
  schema: [],
  messages: {
    tooFewFeatures: MESSAGE,
    tooManyFeatures: MESSAGE,
  },
} as const
