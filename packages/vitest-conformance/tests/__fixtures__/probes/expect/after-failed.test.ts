import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const readMissing = (record: { readonly missing?: number }): number => {
  if (record.missing === undefined) throw new TypeError('caused by the failure above')
  return record.missing
}

const observed = (): number => 1

it.effect('Should_ReportAfterFailedExpect_When_ThrowFollowsAFailedCheck', () =>
  Effect.gen(function*() {
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => readMissing({})))
    expect(observed()).toEqual(2)
  }))
