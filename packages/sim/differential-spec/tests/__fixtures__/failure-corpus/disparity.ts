import { differentialReport, reportCheck } from '@systemfsoftware/differential-spec'
import type { RecordedRun } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { integers } from '../arbitraries.js'
import type { CorpusFixture } from './record.js'

export const defectFile = 'packages/sim/differential-spec/tests/__fixtures__/failure-corpus/disparity.ts'

const reference = (value: number): Effect.Effect<number> => Effect.succeed(value * 2)

const oneMoreThanDoubled = (value: number): Effect.Effect<number> => Effect.succeed(value * 2 + 1)

const sameOutcome = (left: number, right: number): boolean => left === right

const program: RecordedRun<void, never> = (checks) =>
  Effect.flatMap(
    differentialReport(reference, oneMoreThanDoubled, integers, sameOutcome, { runBudget: 10 }),
    (report) => reportCheck(report, checks.expect),
  )

export const disparity: CorpusFixture<never> = {
  name: 'a differential disparity',
  defectFile,
  raisingFile: defectFile,
  program,
}
