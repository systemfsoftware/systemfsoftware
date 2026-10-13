import { it } from '@systemfsoftware/vitest'
import { Effect, Ref } from 'effect'
import { countedRuns, exploredRecord, interruptedChildWrite, lostUpdate } from './__fixtures__/seed-budget.js'

const replayOf = (record: string): Record<string, boolean> => ({
  failed: record.length > 0,
  seed: /\bseed=\d+/u.test(record),
  path: /\bpath=\d+(?:,\d+)*/u.test(record),
})

it('Should_RunTheBaselineAlone_When_TheCaseHasNoChoicePoint', function*({ expect }) {
  const runs = yield* Ref.make(0)
  const record = yield* Effect.promise(() => runs.pipe(countedRuns, exploredRecord))
  const counted = yield* Ref.get(runs)
  yield* expect({ record, runs: counted }).toEqual({ record: '', runs: 1 })
})

it('Should_FindTheWriteWithAReplayableSeed_When_OneFiberForksAChildItInterrupts', function*({ expect }) {
  const record = yield* Effect.promise(() => exploredRecord(interruptedChildWrite))
  yield* expect(replayOf(record)).toEqual({ failed: true, seed: true, path: true })
})

it('Should_FindTheLostUpdateWithAReplayableSeed_When_TwoFibersRace', function*({ expect }) {
  const record = yield* Effect.promise(() => exploredRecord(lostUpdate))
  yield* expect(replayOf(record)).toEqual({ failed: true, seed: true, path: true })
})
