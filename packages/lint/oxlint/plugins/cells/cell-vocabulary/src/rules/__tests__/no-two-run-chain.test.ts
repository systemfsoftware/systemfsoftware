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
const PIPE_IMPORT = `import { pipe } from 'effect'`

const RUN_NAME = Cell.vocabulary.shell.run

const error = () =>
  ({
    messageId: 'twoRunChain',
    data: {
      name: RUN_NAME,
      expected: TWO_RUN_CHAIN_EXPECTED,
      actual: TWO_RUN_CHAIN_ACTUAL,
      fix: TWO_RUN_CHAIN_FIX,
    },
  }) as const

ruleTester.run('no-two-run-chain', noTwoRunChain, {
  valid: [
    {
      name: 'Should_ReportNothing_When_AndThenChainUsed',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { pipe } from 'effect/Function'
const prepareCell = Cell.layer({ read: (i) => i, decode: (x) => x, decide: (x) => x, write: (x) => x })
const instrumentCell = Cell.layer({ read: (i) => i, decode: (x) => x, decide: (x) => x, write: (x) => x })
const dryRunCell = Cell.layer({ read: (i) => i, decode: (x) => x, decide: (x) => x, write: (x) => x })
const mutationTestCell = Cell.layer({ read: (i) => i, decode: (x) => x, decide: (x) => x, write: (x) => x })
export const mutationRun = pipe(prepareCell, Cell.andThen(instrumentCell), Cell.andThen(dryRunCell), Cell.andThen(mutationTestCell))
`,
    },
    {
      name: 'Should_ReportNothing_When_SingleRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const r = yield* Cell.run(c, { id: '1' })
  return r
})
`,
    },
    {
      name: 'Should_ReportNothing_When_TwoIndependentlySourcedRuns',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
class OrderRequest { constructor(id) { this.id = id } }
const run = Effect.gen(function*() {
  const a = yield* Cell.run(c1, new OrderRequest('a'))
  const b = yield* Cell.run(c2, new OrderRequest('b'))
  return { a, b }
})
`,
    },
    {
      name: 'Should_ReportNothing_When_TwoRunsDataLastIndependentlySourced',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${PIPE_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
class OrderRequest { constructor(id) { this.id = id } }
const run = Effect.gen(function*() {
  const a = yield* pipe(c1, Cell.run(new OrderRequest('a')))
  const b = yield* pipe(c2, Cell.run(new OrderRequest('b')))
  return { a, b }
})
`,
    },
    {
      name: 'Should_ReportNothing_When_ZipUsed',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const z = Cell.zip(c1, c2)
const run = Effect.gen(function*() {
  const r = yield* Cell.run(z, { id: '1' })
  return r
})
`,
    },
    {
      name: 'Should_ReportNothing_When_ClosureCapturedBinding',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const outer = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  const inner = Effect.gen(function*() {
    const second = yield* Cell.run(c2, firstResponse)
    return second
  })
  return inner
})
`,
    },
    {
      name: 'Should_ReportNothing_When_ImportedHelper',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { getFirst } from './helper.js'
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = getFirst()
  const second = yield* Cell.run(c2, firstResponse)
  return second
})
`,
    },
    {
      name: 'Should_ReportNothing_When_ReassignedBeforeSecondRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  let r
  r = yield* Cell.run(c1, { id: '1' })
  r = { id: 'other' }
  const second = yield* Cell.run(c2, r)
  return second
})
`,
    },
    {
      name: 'Should_ReportNothing_When_PackedObjectIndirection',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  const packed = { r: firstResponse }
  const second = yield* Cell.run(c2, packed.r)
  return second
})
`,
    },
    {
      name: 'Should_ReportNothing_When_SelfRunMethodForm',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const cell = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(cell, { id: '1' })
  const second = yield* cell.run(firstResponse)
  return second
})
`,
    },
    {
      name: 'Should_ReportNothing_When_DestructuredIndependentlySourced',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
class OrderRequest { constructor(id) { this.id = id } }
const run = Effect.gen(function*() {
  const { a } = yield* Cell.run(c1, new OrderRequest('a'))
  const { b } = yield* Cell.run(c2, new OrderRequest('b'))
  return { a, b }
})
`,
    },
    {
      // a callback parameter's name must not leak into the enclosing scope: the outer
      // `response` is a function parameter, not the run's success
      name: 'Should_ReportNothing_When_CallbackParamNameShadowsOuterBinding',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = (response, input) =>
  Effect.gen(function*() {
    yield* Cell.run(c1, input).pipe(Effect.flatMap((response) => Effect.succeed(response)))
    return yield* Cell.run(c2, response)
  })
`,
    },
    {
      name: 'Should_ReportNothing_When_RunBindingAliased',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const myRun = Cell.run
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* myRun(c1, { id: '1' })
  const second = yield* myRun(c2, firstResponse)
  return second
})
`,
    },
  ],
  invalid: [
    {
      // byte-faithful runBoth gen body from packages/testing/mutation/stryker-js/engine/tests/cell-layer-composition.integration.test.ts lines 55-60
      // Swapping this invalid with the valid andThen fixture must make the suite fail — do not 'simplify' the pair.
      name: 'Should_Report_TwoRunChain_When_RunBothGenFeedsFirstResponse',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
class OrderRequest { constructor(args) { this.id = args.id } }
const orders = { first: Cell.layer({ read: (i) => i }), second: Cell.layer({ read: (i) => i }) }
const runBoth = (orders) =>
  Effect.gen(function*() {
    const firstResponse = yield* Cell.run(orders.first, new OrderRequest({ id: 'initial-request' }))
    yield* Cell.run(orders.second, firstResponse)
    return { firstResponse }
  })
`,
      errors: [{ ...error(), line: 8 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_PipeFlatMapCallbackFeedsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Cell.layer({ read: (i) => i })
const second = Cell.layer({ read: (i) => i })
const run = (input) =>
  Cell.run(first, input).pipe(
    Effect.flatMap((response) => Cell.run(second, response)),
  )
`,
      errors: [{ ...error(), line: 7 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_EmptyRNoProvide',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  const second = yield* Cell.run(c2, firstResponse)
  return second
})
`,
      errors: [{ ...error(), line: 7 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_ImportBelowCall',
      code: `const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  yield* Cell.run(c2, firstResponse)
  return firstResponse
})
${CELL_IMPORT}
${EFFECT_IMPORT}
`,
      errors: [{ ...error(), line: 5 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_MemberRootedInput',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  const second = yield* Cell.run(c2, firstResponse.id)
  return second
})
`,
      errors: [{ ...error(), line: 7 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_ObjectDestructuredSuccessFedOnward',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const { id } = yield* Cell.run(c1, { id: '1' })
  const second = yield* Cell.run(c2, id)
  return second
})
`,
      errors: [{ ...error(), line: 7 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_DataLastPipeCurriedFeedsPriorSuccess',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${PIPE_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const firstResponse = yield* Cell.run(c1, { id: '1' })
  const second = yield* pipe(c2, Cell.run(firstResponse))
  return second
})
`,
      errors: [{ ...error(), line: 8 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_DataFirstFlatMapFeedsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Cell.layer({ read: (i) => i })
const second = Cell.layer({ read: (i) => i })
const run = (input) =>
  Effect.flatMap(Cell.run(first, input), (response) => Cell.run(second, response))
`,
      errors: [{ ...error(), line: 6 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_DataFirstAndThenFeedsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Cell.layer({ read: (i) => i })
const second = Cell.layer({ read: (i) => i })
const run = (input) =>
  Effect.andThen(Cell.run(first, input), (response) => Cell.run(second, response))
`,
      errors: [{ ...error(), line: 6 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_DataFirstMapFeedsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Cell.layer({ read: (i) => i })
const second = Cell.layer({ read: (i) => i })
const run = (input) =>
  Effect.map(Cell.run(first, input), (response) => Cell.run(second, response))
`,
      errors: [{ ...error(), line: 6 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_TapPipeStepFeedsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const first = Cell.layer({ read: (i) => i })
const second = Cell.layer({ read: (i) => i })
const run = (input) =>
  Cell.run(first, input).pipe(
    Effect.tap((response) => Cell.run(second, response)),
  )
`,
      errors: [{ ...error(), line: 7 }],
    },
    {
      name: 'Should_Report_TwoRunChain_When_PipeCurriedFirstBinding',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${PIPE_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const c2 = Cell.layer({ read: (i) => i })
const run = Effect.gen(function*() {
  const first = yield* pipe(c1, Cell.run({ id: '1' }))
  const second = yield* Cell.run(c2, first)
  return second
})
`,
      errors: [{ ...error(), line: 8 }],
    },
  ],
})
