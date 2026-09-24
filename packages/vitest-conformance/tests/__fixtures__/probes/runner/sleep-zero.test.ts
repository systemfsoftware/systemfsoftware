import { expect, it } from '@effect/vitest'
import { Clock } from 'effect'
import { Effect } from 'effect'

it.effect('Should_StayAtZero_When_SleepEndsImmediately', () =>
  Effect.gen(function*() {
    yield* Effect.sleep(0)
    const now = yield* Clock.currentTimeMillis
    expect(now).toEqual(0)
  }))
