import { afterEach, beforeEach, describe, it, recordAssertion } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

describe('per-test hooks are refused', () => {
  beforeEach(() => Effect.void)

  afterEach(() => Effect.void)

  it.effect('Should_ReachTheBody_When_HooksAreRefused', () => Effect.sync(() => recordAssertion()))
})
