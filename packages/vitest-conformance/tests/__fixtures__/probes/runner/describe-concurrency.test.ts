import { describe, it } from '@effect/vitest'
import { Deferred } from 'effect'

const one = Deferred.makeUnsafe<string>()
const two = Deferred.makeUnsafe<string>()

describe('a describe block runs its tests concurrently', () => {
  it('Should_MeetItsPartner_When_OneSignalsFirst', function*({ expect }) {
    yield* Deferred.succeed(two, 'two')
    yield* expect(yield* Deferred.await(one)).toEqual('one')
  })

  it('Should_MeetItsPartner_When_TwoSignalsFirst', function*({ expect }) {
    yield* Deferred.succeed(one, 'one')
    yield* expect(yield* Deferred.await(two)).toEqual('two')
  })
})
