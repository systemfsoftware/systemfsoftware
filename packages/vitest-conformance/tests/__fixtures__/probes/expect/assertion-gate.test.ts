import { describe, it, recordAssertion } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

describe('no-assertion gate', () => {
  it.effect('Should_PassTheGate_When_RecordAssertionCountsTheCheck', () =>
    Effect.gen(function*() {
      const checked = 1 + 1 === 2
      if (checked) recordAssertion()
      yield* Effect.void
    }))

  it.effect('Should_FailTheGate_When_NoAssertionRuns', () => Effect.void)
})
