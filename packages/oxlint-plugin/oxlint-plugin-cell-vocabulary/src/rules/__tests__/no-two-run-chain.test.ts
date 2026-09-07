import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import { TWO_RUN_CHAIN_ACTUAL, TWO_RUN_CHAIN_EXPECTED, TWO_RUN_CHAIN_FIX } from '../no-two-run-chain.config.js'
import { noTwoRunChain } from '../no-two-run-chain.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const error = (chainedOn: string) =>
  ({
    messageId: 'twoRunChain',
    data: {
      chainedOn,
      expected: TWO_RUN_CHAIN_EXPECTED,
      actual: TWO_RUN_CHAIN_ACTUAL,
      fix: TWO_RUN_CHAIN_FIX,
    },
  }) as const

ruleTester.run('no-two-run-chain', noTwoRunChain, {
  valid: [
    {
      name: 'Should_ReportNothing_When_SingleRunSitsInGen',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const prepared = yield* runPrepare(input)
  const instrumented = yield* Cell.run(instrumentCell, prepared)
  return instrumented
})`,
    },
    {
      name: 'Should_ReportNothing_When_TwoRunsShareOneIndependentInput',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const first = yield* Cell.run(firstCell, input)
  const second = yield* Cell.run(secondCell, input)
  return second
})`,
    },
    {
      name: 'Should_ReportNothing_When_RunsSitInSeparateGenerators',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, input)
  return a
})
const second = Effect.gen(function*() {
  const b = yield* Cell.run(secondCell, input)
  return b
})`,
    },
    {
      name: 'Should_ReportNothing_When_CellsAliasNearMissChains',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const Cells = Cell
const program = Effect.gen(function*() {
  const a = yield* Cells.run(firstCell, input)
  const b = yield* Cells.run(secondCell, a)
  return b
})`,
    },
    {
      name: 'Should_ReportNothing_When_InputReadsAnUntrackedMemberRoot',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const config = { retries: 3 }
  const a = yield* Cell.run(firstCell, config.retries)
  return a
})`,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportTwice_When_EngineThreeChainShape',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
export const runMutationTest = (cliOptions, targetMutatePatterns) =>
  Effect.gen(function*() {
    const prepared = yield* runPrepare({ cliOptions, targetMutatePatterns })
    const instrumented = yield* Cell.run(instrumentCell, prepared)
    const dryDone = yield* Cell.run(dryRunCell, instrumented)
    return yield* Cell.run(mutationTestCell, dryDone)
  })`,
      errors: [error('instrumented'), error('dryDone')],
    },
    {
      name: 'Should_ReportOnce_When_TwoChainSharesPriorResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, input)
  const b = yield* Cell.run(secondCell, a)
  return b
})`,
      errors: [error('a')],
    },
    {
      name: 'Should_ReportOnce_When_InputArrivesThroughAliasVariable',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, input)
  const alias = a
  const b = yield* Cell.run(secondCell, alias)
  return b
})`,
      errors: [error('alias')],
    },
    {
      name: 'Should_ReportOnce_When_InputIsAMemberRootOnTrackedBinding',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, input)
  const b = yield* Cell.run(secondCell, a.report)
  return b
})`,
      errors: [error('a')],
    },
    {
      name: 'Should_ReportOnce_When_InputIsAnObjectLiteralPropertyValue',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const a = yield* Cell.run(firstCell, input)
  const b = yield* Cell.run(secondCell, { value: a })
  return b
})`,
      errors: [error('a')],
    },
  ],
})
