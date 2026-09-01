import { Effect, Schema as S } from 'effect'
import { ABSENCE_MESSAGE, MESSAGE } from './path.config.js'

export const Options = S.Struct({
  cellsRequiringTest: S.Array(S.String).pipe(
    S.annotate({
      description:
        'Cell suffixes whose source files must carry a test, named without the leading dot (e.g. ["kernel", "workflow"]). Empty by default: a consumer who declares nothing is never accused. A cell listed here is satisfied by an in-source `if (import.meta.vitest)` block, which is the only form the rule can read from the file it is given.',
    }),
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const UNSANCTIONED_CELL_EXPECTED =
  'a property test named <stem>.workflow.property.test.ts inside __tests__, beside the <stem>.workflow.ts it covers' as const
export const UNSANCTIONED_CELL_ACTUAL =
  'a property test under src/ whose basename is not a single-segment <stem>.workflow.property.test.ts' as const
export const UNSANCTIONED_CELL_FIX =
  "rename it <stem>.workflow.property.test.ts beside the workflow it covers; a kernel/policy/schema property suite has no file home under the new taxonomy — delete it or move property coverage to the workflow's exported contract (in-source blocks are snapshot-only and never carry property suites)" as const

export const MISSING_CELL_TEST_EXPECTED =
  'a test for every cell suffix the consumer lists in cellsRequiringTest' as const
export const MISSING_CELL_TEST_ACTUAL =
  'a declared cell whose own module carries no `if (import.meta.vitest)` block' as const
export const MISSING_CELL_TEST_FIX =
  'add an `if (import.meta.vitest)` block to this module, or drop this cell from cellsRequiringTest and cover it with a colocated test in a sanctioned test directory — the rule reads the file it is given, so a sibling test file is invisible to it and a declared cell must satisfy the requirement from its own source' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A property test under src/ must be a single-segment <stem>.workflow.property.test.ts beside the <stem>.workflow.ts it covers; every other property-test basename is unsanctioned. A source file whose suffix names a cell listed in the cellsRequiringTest option must additionally carry an in-source vitest block; that list is empty by default, so the presence arm is opt-in per consumer.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    unsanctionedCell: MESSAGE,
    missingCellTest: ABSENCE_MESSAGE,
  },
} as const
