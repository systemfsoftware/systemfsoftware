import { describe, it, recordAssertion } from '@systemfsoftware/vitest'
import { Deferred } from 'effect'
import { Effect } from 'effect'

const recorded = Deferred.makeUnsafe<void>()

describe('concurrent no-assertion gate', () => {
  it.effect('Should_PassTheGate_When_ItsOwnRecordCounts', () =>
    Effect.gen(function*() {
      yield* Effect.sync(() => recordAssertion())
      yield* Deferred.succeed(recorded, undefined)
    }))

  it.effect('Should_FailTheGate_When_OnlyASiblingRecorded', () => Deferred.await(recorded))
})
