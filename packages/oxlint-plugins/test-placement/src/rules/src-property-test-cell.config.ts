import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_CELL_EXPECTED =
  'a property test colocated with a .workflow, .policy, or .kernel cell' as const
export const UNSANCTIONED_CELL_ACTUAL = 'a property test whose stem names no cell that may carry properties' as const
export const UNSANCTIONED_CELL_FIX =
  'rename it <cell-file>.property.test.ts beside the workflow, policy, or kernel it covers; a schema may carry one only to state what it REJECTS — its acceptance laws are generated into schema-laws.test.ts — and every other cell is covered at composition altitude' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A property test under src/ must be colocated with the pure cell it covers: a workflow, a policy, or a kernel. A schema may carry one only for refusal — its acceptance laws are generated into schema-laws.test.ts; every other cell is covered at composition altitude.',
  },
  schema: [],
  messages: {
    unsanctionedCell: MESSAGE,
  },
} as const
