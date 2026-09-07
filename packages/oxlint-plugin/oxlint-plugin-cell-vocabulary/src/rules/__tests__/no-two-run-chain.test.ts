import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import { TWO_RUN_CHAIN_ACTUAL, TWO_RUN_CHAIN_EXPECTED, TWO_RUN_CHAIN_FIX } from '../no-two-run-chain.config.js'
import { noTwoRunChain } from '../no-two-run-chain.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

// Every axis value in the fixtures below is derived from the vocabulary at
// runtime, never spelled: the import's module name comes from Cell.vocabulary, and the
// message's expected data comes from the same config import the rule uses. If the
// derivation is severed, the expected data no longer matches the rendered message and
// the invalid fixtures stop reporting.
const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const error = (name: string) =>
  ({
    messageId: 'twoRunChain',
    data: {
      name,
      expected: TWO_RUN_CHAIN_EXPECTED,
      actual: TWO_RUN_CHAIN_ACTUAL,
      fix: TWO_RUN_CHAIN_FIX,
    },
  }) as const

ruleTester.run('no-two-run-chain', noTwoRunChain, {
  valid: [
    {
      name: 'Should_ReportNothing_When_SingleRunUsesLiteralInput',
      code: `${CELL_IMPORT}
const program = Cell.run(cellA, { id: 'id-1' })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_SingleRunUsesParamInput',
      code: `${CELL_IMPORT}
const runCell = (input) => Cell.run(cellA, input)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_LoopRerunsCellWithLoopVariable',
      code: `${CELL_IMPORT}
const runAll = (inputs) => {
  const out = []
  for (const input of inputs) {
    out.push(Cell.run(cellA, input))
  }
  return out
}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_AndThenSpineRunsOnce',
      code: `${CELL_IMPORT}
const spine = Cell.andThen(cellA, cellB)
const program = Cell.run(spine, x)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_RunsSitInDifferentFunctionBodies',
      code: `${CELL_IMPORT}
const first = (x) => Cell.run(cellA, x)
const second = (a) => Cell.run(cellB, a)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      // The member key spells like the run-bound name, but a key written beside its
      // object is not a read of that name — only the object counts. A walker that treats
      // every identifier as a reference reports this run.
      name: 'Should_ReportNothing_When_OnlyAMemberKeySpellsLikeARunBinding',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const field = yield* Cell.run(cellA, x)
  const b = yield* Cell.run(cellB, other.field)
  return b
})`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SecondRun_When_InputReusesEarlierRunResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const a = yield* Cell.run(cellA, x)
  const b = yield* Cell.run(cellB, a)
  return b
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Cell.run')],
    },
    {
      name: 'Should_Report_LaterRuns_When_ChainRunsThrice',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const a = yield* Cell.run(cellA, x)
  const b = yield* Cell.run(cellB, a)
  const c = yield* Cell.run(cellC, b)
  return c
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Cell.run'), error('Cell.run')],
    },
    {
      // The earlier result binds through an array pattern rather than a plain name. A
      // collector that only reads `VariableDeclarator.id` identifiers misses it and the
      // chained run goes unreported.
      name: 'Should_Report_Run_When_InputReferencesDestructuredRunResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const [a] = yield* Cell.run(cellA, x)
  const b = yield* Cell.run(cellB, a)
  return b
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Cell.run')],
    },
    {
      // The earlier result rebinds through a plain assignment rather than a declaration.
      // A collector that only walks declarations misses it and the chained run goes
      // unreported.
      name: 'Should_Report_Run_When_InputReferencesAssignedRunResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  let a = yield* Cell.run(cellA, x)
  a = yield* Cell.run(cellB, a)
  return a
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Cell.run')],
    },
    {
      // The description namespace arrives under an import alias. The receiver rides the
      // import edge, never the spelling, so the chain still reports — and under the
      // written name.
      name: 'Should_Report_SecondRun_When_DescriptionNamespaceIsAliased',
      code: `import { Cell as C } from '${Cell.vocabulary.module}'
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const a = yield* C.run(cellA, x)
  const b = yield* C.run(cellB, a)
  return b
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('C.run')],
    },
    {
      // The input reads a field off the earlier result. A reference check that stops at
      // member expressions misses the object and the chained run goes unreported.
      name: 'Should_Report_Run_When_InputReadsAFieldOffTheEarlierResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const a = yield* Cell.run(cellA, x)
  const b = yield* Cell.run(cellB, a.field)
  return b
})`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Cell.run')],
    },
  ],
})
