import { describe, expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

describe('deliberate assertions stay legal', () => {
  it.effect('Should_AcceptToBeOnObjects_When_IdentityIsTheClaim', () =>
    Effect.gen(function*() {
      const shared = { tag: 'shared' }
      const same = shared
      return yield* Effect.sync(() => expect(same).toBe(shared))
    }))

  it.effect('Should_AcceptTypeChecks_When_TheClaimIsAboutType', () =>
    Effect.gen(function*() {
      const refusal = new RangeError('epoch out of range')
      return yield* Effect.sync(() => {
        expect(refusal.message).toBeTypeOf('string')
        expect(refusal).toBeInstanceOf(RangeError)
      })
    }))
})
