import type { RuleTester } from 'oxlint/plugins-dev'

const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const SEQUENCED_NAME = 'a Cell.run whose success binding feeds a second Cell.run'
const SEQUENCED_EXPECTED =
  'one Effect.gen body that runs each Cell once, with independent runs fanned out and response-to-command composition carried by Cell.andThen'
const SEQUENCED_ACTUAL =
  'the success binding of one Cell.run is the input of a second Cell.run in the same Effect.gen body — hand-bound sequencing Cell.andThen already composes'
const SEQUENCED_FIX =
  'compose the two cells with Cell.andThen(first, second) and run the spine once; when the runs are independent, keep the fan-out and stop feeding one binding into the other; when nothing consumes the second run, delete it'

const error = () => ({
  messageId: 'sequencedCellRun' as const,
  data: {
    name: SEQUENCED_NAME,
    expected: SEQUENCED_EXPECTED,
    actual: SEQUENCED_ACTUAL,
    fix: SEQUENCED_FIX,
  },
})

export const sequencedCellRunInvalidCases = (cellModule: string): RuleTester.InvalidTestCase[] => {
  const cellImport = `import { Cell } from '${cellModule}'`
  return [
    {
      name: 'Should_Report_SecondRun_When_SuccessBindingFeedsIt',
      code: `${cellImport}
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
      code: `${cellImport}
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
  ]
}
