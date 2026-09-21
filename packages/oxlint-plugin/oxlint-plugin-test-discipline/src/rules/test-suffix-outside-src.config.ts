import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_SUFFIX_EXPECTED =
  'exactly *.integration.test.ts or *.differential.test.ts outside src/' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'an unsanctioned test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  'name what this file exercises. Every scenario restates a literal from a pure cell (a lookup-table entry, a constant, a mapping) -> it is a change detector, not a test: delete it. It drives the package through its public surface -> rename it *.integration.test.ts, the one behaviour suffix, whether or not a layer doubles at a port. It proves parity or a metamorphic relation between implementations -> rename it *.differential.test.ts and express it through @systemfsoftware/differential-spec. It is a property over a pure cell -> it does not belong outside src/: convert it to an in-source if (import.meta.vitest) block in the module it covers' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Outside src/, a test file must end .integration.test.ts or .differential.test.ts. Integration is the behaviour suffix; differential is the parity/metamorphic suffix driven by @systemfsoftware/differential-spec. Whether the layer doubles at a port is a judgement the suffix no longer encodes.',
  },
  schema: [],
  messages: {
    unsanctionedSuffix: MESSAGE,
  },
} as const
