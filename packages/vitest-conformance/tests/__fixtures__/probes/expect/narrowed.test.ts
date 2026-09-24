import { describe, expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const present = (): number => 1
const text = (): string => 'value'
const blank = (): string => ''

describe('narrowed refusals', () => {
  it.effect('Should_RefuseToBeDefined_When_PresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(present()).toBeDefined()))

  it.effect('Should_RefuseToBeTruthy_When_PresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(text()).toBeTruthy()))

  it.effect('Should_RefuseToBeFalsy_When_PresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(blank()).toBeFalsy()))

  it.effect('Should_RefuseNotToBeNull_When_NegatedPresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(present()).not.toBeNull()))

  it.effect('Should_RefuseNotToBeUndefined_When_NegatedPresenceCheckRuns', () =>
    // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
    Effect.sync(() => expect(present()).not.toBeUndefined()))
})
