import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'

it.effect('Should_ReportOnlyTheCheck_When_NothingThrowsAfterAFailedCheck', () =>
  Effect.gen(function*() {
    yield* Effect.void
    expect(1).toEqual(2)
  }))
