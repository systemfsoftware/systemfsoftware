import { JSONSchema, Schema as S } from 'effect'
import { ABSENCE_MESSAGE, COLOCATABLE_CELLS, MESSAGE } from './path.config.js'

const SANCTIONED_CELLS = COLOCATABLE_CELLS.join(', ')

export const Options = S.Struct({
  cellsRequiringTest: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description:
        'Cell suffixes whose source files must carry a test, named without the leading dot (e.g. ["kernel", "workflow"]). Empty by default: a consumer who declares nothing is never accused. A cell listed here is satisfied by an in-source `if (import.meta.vitest)` block, which is the only form the rule can read from the file it is given.',
    })),
    { default: () => [] },
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const UNSANCTIONED_CELL_EXPECTED =
  'a property test colocated with a .workflow, .policy, or .kernel cell' as const
export const UNSANCTIONED_CELL_ACTUAL = 'a property test whose stem names no cell that may carry properties' as const
export const UNSANCTIONED_CELL_FIX =
  'rename it <cell-file>.property.test.ts beside the workflow, policy, or kernel it covers; a schema may carry one only for a `refutes(schema, generators)` refusal — its acceptance laws are generated into schema-laws.test.ts — and every other cell is covered at composition altitude' as const

export const MISSING_CELL_TEST_EXPECTED =
  'a test for every cell suffix the consumer lists in cellsRequiringTest' as const
export const MISSING_CELL_TEST_ACTUAL =
  'a declared cell whose own module carries no `if (import.meta.vitest)` block' as const
export const MISSING_CELL_TEST_FIX =
  `add an \`if (import.meta.vitest)\` block to this module, or drop this cell from cellsRequiringTest and cover it with a colocated test in a sanctioned test directory (${SANCTIONED_CELLS}) — the rule reads the file it is given, so a sibling test file is invisible to it and a declared cell must satisfy the requirement from its own source` as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A property test under src/ must be colocated with the pure cell it covers: a workflow, a policy, or a kernel. A schema may carry one only for a `refutes(schema, generators)` refusal — its acceptance laws are generated into schema-laws.test.ts; every other cell is covered at composition altitude. A source file whose suffix names a cell listed in the cellsRequiringTest option must additionally carry an in-source vitest block; that list is empty by default, so the presence arm is opt-in per consumer.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    unsanctionedCell: MESSAGE,
    missingCellTest: ABSENCE_MESSAGE,
  },
} as const
