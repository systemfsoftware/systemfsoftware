import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'

describe('per-test hooks are refused', () => {
  beforeEach(() => Effect.void)

  afterEach(() => Effect.void)

  it.effect('Should_ReachTheBody_When_HooksAreRefused', () => Effect.sync(() => expect(1).toEqual(1)))
})
