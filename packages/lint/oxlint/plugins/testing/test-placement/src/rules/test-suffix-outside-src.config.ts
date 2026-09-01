import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_SUFFIX_EXPECTED = 'exactly *.integration.test.ts outside src/' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'an unsanctioned test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  'name what this file exercises. Every scenario restates a literal from a pure cell (a lookup-table entry, a constant, a mapping) -> it is a change detector, not a test: delete it. It drives the package through its public surface -> rename it *.integration.test.ts, the one behaviour suffix, whether or not a layer doubles at a port. It is a property over a pure cell -> it belongs in a <stem>.workflow.property.test.ts beside the workflow it covers, or in generated schema laws; an in-source block holds authored inline snapshots only' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Outside src/, a test file must end .integration.test.ts — the one behaviour suffix. Whether the layer doubles at a port is a judgement the suffix no longer encodes.',
  },
  schema: [],
  messages: {
    unsanctionedSuffix: MESSAGE,
  },
} as const
