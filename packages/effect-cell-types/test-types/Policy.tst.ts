import type { Policy } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

declare const someEffect: Effect<string, Error, never>

describe('the policy combinator type', () => {
  it('Should_BeExactlyTheEffectPreservingFunctionType_When_Instantiated', () => {
    expect<Policy.Policy<string, Error, never>>().type.toBe<
      (self: Effect<string, Error, never>) => Effect<string, Error, never>
    >()
  })

  it('Should_AcceptIdentityCombinator_When_ItPreservesChannels', () => {
    expect<(self: Effect<string, Error, never>) => Effect<string, Error, never>>().type.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_RejectCombinatorChangingSuccess_When_PolicyRequired', () => {
    // TS2322 — Effect<number, Error, never> is not assignable to Effect<string, Error, never>
    expect<(self: Effect<string, Error, never>) => Effect<number, Error, never>>().type.not.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_RejectCombinatorRewritingError_When_PolicyRequired', () => {
    // TS2322 — Effect<string, string, never> is not assignable to Effect<string, Error, never>
    expect<(self: Effect<string, Error, never>) => Effect<string, string, never>>().type.not.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_ApplyToEffect_When_Used', () => {
    expect<Policy.Policy<string, Error, never>>().type.toBeCallableWith(someEffect)
  })
})
