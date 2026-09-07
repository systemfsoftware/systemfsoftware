import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import {
  SEQUENCED_CELL_RUN_ACTUAL,
  SEQUENCED_CELL_RUN_EXPECTED,
  SEQUENCED_CELL_RUN_FIX,
} from '../no-sequenced-cell-run.config.js'
import { noSequencedCellRun } from '../no-sequenced-cell-run.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const error = () =>
  ({
    messageId: 'sequencedCellRun',
    data: {
      name: 'a Cell.run whose success binding feeds a second Cell.run',
      expected: SEQUENCED_CELL_RUN_EXPECTED,
      actual: SEQUENCED_CELL_RUN_ACTUAL,
      fix: SEQUENCED_CELL_RUN_FIX,
    },
  }) as const

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
  invalid: [
    {
      name: 'Should_Report_SecondRun_When_SuccessBindingFeedsIt',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const instrumented = yield* Cell.run(instrumentCell, prepared)
  const dryDone = yield* Cell.run(dryRunCell, instrumented)
  return dryDone
})`,
      filename: 'run.executor.ts',
      errors: [error()],
    },
    {
      name: 'Should_Report_BothDownstreamRuns_When_ThreeRunChain',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
export const program = Effect.gen(function*() {
  const prepared = yield* runPrepare(cmd)
  const instrumented = yield* Cell.run(instrumentCell, prepared)
  const dryDone = yield* Cell.run(dryRunCell, instrumented)
  return yield* Cell.run(mutationTestCell, dryDone)
})`,
      filename: 'run.executor.ts',
      errors: [error(), error()],
    },
  ],
})
