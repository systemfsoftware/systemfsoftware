import { COLOCATABLE_CELLS, MESSAGE, NESTED_TEST_DIR } from './path.config.js'

const SANCTIONED_CELLS = COLOCATABLE_CELLS.join(', ')

export const UNSANCTIONED_SUFFIX_EXPECTED = 'exactly *.integration.test.ts outside src/' as const
export const UNSANCTIONED_SUFFIX_ACTUAL = 'an unsanctioned test suffix outside src/' as const
export const UNSANCTIONED_SUFFIX_FIX =
  `name what this file exercises. Every scenario restates a literal from a pure cell (a lookup-table entry, a constant, a mapping) -> it is a change detector, not a test: delete it. It drives the package through its public surface -> rename it *.integration.test.ts, the one behaviour suffix, whether or not a layer doubles at a port. It is a property over a sanctioned cell (${SANCTIONED_CELLS}) -> it does not belong outside src/: move it to src/<dir>/${NESTED_TEST_DIR}/<cell>.property.test.ts`

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
