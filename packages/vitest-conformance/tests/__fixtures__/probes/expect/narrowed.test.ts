import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'

describe('narrowed refusals', () => {
  it.effect('Should_RefuseToBeDefined_When_APresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(1).toBeDefined()))

  it.effect('Should_RefuseToBeTruthy_When_APresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect('value').toBeTruthy()))

  it.effect('Should_RefuseToBeFalsy_When_APresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect('').toBeFalsy()))

  it.effect('Should_RefuseNotToBeNull_When_ANegatedPresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(1).not.toBeNull()))

  it.effect('Should_RefuseNotToBeUndefined_When_ANegatedPresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(1).not.toBeUndefined()))
})
