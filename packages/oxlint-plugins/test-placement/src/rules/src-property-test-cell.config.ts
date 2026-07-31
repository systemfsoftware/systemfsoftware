import { MESSAGE } from './path.config.js'

export const UNSANCTIONED_CELL_EXPECTED = 'a property test colocated with a .workflow or .policy cell' as const
export const UNSANCTIONED_CELL_ACTUAL = 'a property test whose stem names no cell that may carry properties' as const
export const UNSANCTIONED_CELL_FIX =
  'rename it <cell-file>.property.test.ts beside the workflow or policy it covers; a schema carries no authored test — the generated schema-laws.test.ts holds its laws — and every other cell is covered at composition altitude' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A property test under src/ must be colocated with the workflow or policy it covers. A schema needs no authored test — its codec laws are generated into schema-laws.test.ts; other cells are covered at composition altitude.',
  },
  schema: [],
  messages: {
    unsanctionedCell: MESSAGE,
  },
} as const
