import { describe, expect, it } from '@effect/vitest'
import { Deferred, Effect } from 'effect'

const one = Deferred.makeUnsafe<string>()
const two = Deferred.makeUnsafe<string>()

describe('a describe block runs its tests concurrently', () => {
  it.effect('Should_MeetItsPartner_When_OneSignalsFirst', () =>
    Effect.gen(function*() {
      yield* Deferred.succeed(two, 'two')
      expect(yield* Deferred.await(one)).toEqual('one')
    }))

  it.effect('Should_MeetItsPartner_When_TwoSignalsFirst', () =>
    Effect.gen(function*() {
      yield* Deferred.succeed(one, 'one')
      expect(yield* Deferred.await(two)).toEqual('two')
    }))
})
