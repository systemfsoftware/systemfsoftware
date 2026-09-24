import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'

const readMissing = (record: { readonly missing?: number }): number => {
  if (record.missing === undefined) throw new TypeError('caused by the failure above')
  return record.missing
}

it.effect('Should_ReportAfterFailedExpect_When_AThrowFollowsAFailedCheck', () =>
  Effect.gen(function*() {
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => readMissing({})))
    expect(1).toEqual(2)
  }))
