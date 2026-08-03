import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_SUFFIX_EXPECTED = 'exactly *.integration.test.ts or *.snapshot.test.ts outside src/' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'an unsanctioned test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  'first ask what bug this file could catch. If each scenario restates a literal from a pure cell — a lookup-table entry, a constant, a mapping — it is a change detector and not a test: delete it. Otherwise name it *.integration.test.ts: one behaviour suffix, whether or not the layer doubles at a port. A snapshot test pinning the shape of a fixed-seed arbitrary sample belongs at *.snapshot.test.ts; a property test belongs in src/ beside a workflow, policy, or schema cell, never here.' as const

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
