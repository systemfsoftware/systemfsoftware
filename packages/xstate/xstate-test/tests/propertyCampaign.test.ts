import { it } from '@systemfsoftware/vitest'
import { createMachine, types } from '@systemfsoftware/xstate'
import { ModelTestFailure, propertyTest } from '@systemfsoftware/xstate-test'
import * as fc from 'fast-check'
import { Effect } from 'effect'

const counterMachine = createMachine({
  id: 'campaignCounter',
  schemas: {
    context: types<{ count: number }>(),
    events: { INC: types<{}>(), DEC: types<{}>(), RESET: types<{}>() },
  },
  context: { count: 0 },
  on: {
    INC: ({ context }) => ({ context: { count: context.count + 1 } }),
    DEC: ({ context }) => ({ context: { count: context.count - 1 } }),
    RESET: () => ({ context: { count: 0 } }),
  },
})

const events = {
  INC: fc.constant({}),
  DEC: fc.constant({}),
  RESET: fc.constant({}),
}

it('Should_StopTheCampaign_When_TheUntilConditionHolds', function*({ expect }) {
  const stopped = yield* Effect.promise(() =>
    propertyTest(counterMachine, {
      seed: 4,
      numRuns: 1000,
      batchRuns: 1,
      events: { INC: fc.constant({}) },
      invariant: () => undefined,
      until: (coverage) => coverage.exploration.completedRuns >= 3,
    })
  )

  yield* expect({
    stoppedBecause: stopped.coverage.exploration.stoppedBecause,
    completedRuns: stopped.coverage.exploration.completedRuns,
    runs: stopped.coverage.runs,
  }).toEqual({ stoppedBecause: 'until', completedRuns: 3, runs: 3 })
})

it('Should_FreezeTheFailingSwarmAndCountShrinkRuns_When_AnInvariantFails', function*({ expect }) {
  const failure: unknown = yield* Effect.promise(() =>
    propertyTest(counterMachine, {
      seed: 3,
      numRuns: 200,
      maxCommands: 12,
      events,
      swarm: true,
      invariant: ({ snapshot }) => {
        if (snapshot.context.count >= 3) {
          throw new Error('count')
        }
      },
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
  )

  const isFailure = failure instanceof ModelTestFailure
  const fixture = isFailure ? failure.fixture : undefined
  const shrinkRuns = isFailure ? failure.coverage?.exploration.shrinkRuns ?? 0 : 0
  const runs = isFailure ? failure.coverage?.runs ?? 0 : 0
  yield* expect({
    isFailure,
    frozenSwarmKeepsInc: fixture?.swarm?.some((caseId) => caseId.includes('INC')) === true,
    shrunkTimelineIsIncrements: fixture?.timeline.every(
      (entry) => entry.command.type === 'event' && entry.command.event.type === 'INC',
    ) === true,
    shrinkRunsRecorded: shrinkRuns > 0,
    attemptsExceedShrinkRuns: runs > shrinkRuns,
  }).toEqual({
    isFailure: true,
    frozenSwarmKeepsInc: true,
    shrunkTimelineIsIncrements: true,
    shrinkRunsRecorded: true,
    attemptsExceedShrinkRuns: true,
  })
})
