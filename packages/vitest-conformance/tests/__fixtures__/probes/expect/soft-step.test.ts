import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'

// The write after the failed checks announces itself: if it ever runs, its defect lands in the report.
const sideEffect = Effect.die('SIDE EFFECT RAN')

it.effect('Should_ReportBothFailures_When_TwoChecksFailInOneStep', () =>
  Effect.gen(function*() {
    expect(1).toEqual(3)
    expect(2).toEqual(4)
    return yield* sideEffect
  }))
