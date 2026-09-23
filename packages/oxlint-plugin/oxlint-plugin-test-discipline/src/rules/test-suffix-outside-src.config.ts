import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_SUFFIX_EXPECTED =
  '*.integration.test.ts, *.differential.test.ts, *.trace.test.ts, or *.conformance.test.ts' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'another test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  'public surface -> *.integration.test.ts; parity -> *.differential.test.ts; span graph -> *.trace.test.ts; concurrent or stateful behaviour -> *.conformance.test.ts; pure-cell property -> in-source; restated literal -> delete' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Outside src/, a test file ends .integration.test.ts, .differential.test.ts, .trace.test.ts, or .conformance.test.ts.',
  },
  schema: [],
  messages: {
    unsanctionedSuffix: MESSAGE,
  },
} as const
