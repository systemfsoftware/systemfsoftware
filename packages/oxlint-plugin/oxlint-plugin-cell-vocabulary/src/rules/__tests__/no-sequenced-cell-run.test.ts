import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import { sequencedCellRunInvalidCases } from '../no-sequenced-cell-run.corpus.js'
import { noSequencedCellRun } from '../no-sequenced-cell-run.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

ruleTester.run('no-sequenced-cell-run', noSequencedCellRun, {
  valid: [
    {
      name: 'Should_ReportNothing_When_SingleCellRunInGen',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const done = yield* Cell.run(firstCell, cmd)
  return done
})`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_TwoCellRunsAreIndependentFanOut',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, cmd)
  const b = yield* Cell.run(secondCell, cmd)
  return [a, b] as const
})`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_CellsComposeThroughAndThen',
      code: `${CELL_IMPORT}
export const pipeline = Cell.andThen(firstCell, secondCell)`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_RunCalleeIsAnAlias',
      code: `import { Cell as CellAlias } from '${Cell.vocabulary.module}'
${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const a = yield* CellAlias.run(firstCell, cmd)
  const b = yield* CellAlias.run(secondCell, a)
  return b
})`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_GenChainsRawEffectsWithoutCellRun',
      code: `${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const a = yield* Effect.succeed(cmd)
  const b = yield* Effect.map(Effect.succeed(a), (x) => x)
  return b
})`,
      filename: 'run.executor.ts',
    },
  ],
  invalid: sequencedCellRunInvalidCases(Cell.vocabulary.module),
})
