import type { Policy } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

declare const someEffect: Effect<string, Error, never>

describe('T15 the policy type', () => {
  it('Should_BeTheEffectPreservingFunction_When_Instantiated', () => {
    expect<Policy.Policy<string, Error, never>>().type.toBe<
      (self: Effect<string, Error, never>) => Effect<string, Error, never>
    >()
  })

  it('Should_AcceptAnIdentityCombinator_When_TheChannelsHold', () => {
    expect<(self: Effect<string, Error, never>) => Effect<string, Error, never>>().type.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_RefuseACombinator_When_ItChangesTheSuccessChannel', () => {
    expect<(self: Effect<string, Error, never>) => Effect<number, Error, never>>().type.not.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_RefuseACombinator_When_ItRewritesTheErrorChannel', () => {
    expect<(self: Effect<string, Error, never>) => Effect<string, string, never>>().type.not.toBeAssignableTo<
      Policy.Policy<string, Error, never>
    >()
  })

  it('Should_ApplyToAnEffect_When_Used', () => {
    expect<Policy.Policy<string, Error, never>>().type.toBeCallableWith(someEffect)
  })
})
