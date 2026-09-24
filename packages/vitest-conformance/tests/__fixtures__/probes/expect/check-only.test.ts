import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const observed = (): number => 1

it.effect('Should_ReportOnlyTheCheck_When_NothingThrowsAfterAFailedCheck', () =>
  Effect.gen(function*() {
    yield* Effect.void
    expect(observed()).toEqual(2)
  }))
