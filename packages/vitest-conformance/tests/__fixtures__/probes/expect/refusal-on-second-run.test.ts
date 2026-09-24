import { expect, it } from '@systemfsoftware/vitest'
import { Effect, Ref } from 'effect'

const runs = Ref.makeUnsafe(0)

const refuseNarrowed = (value: number): Effect.Effect<void, never, never> =>
  // @ts-expect-error the narrowed matcher is refused at compile time with the rewrite text
  Effect.sync(() => expect(value).toBeDefined())

it.effect('Should_ReportTheNarrowedRefusal_When_TheSecondRunTripsIt', () =>
  Effect.gen(function*() {
    const at = yield* Ref.getAndUpdate(runs, (n) => n + 1)
    if (at > 0) {
      yield* refuseNarrowed(at)
    }
    expect(at).toBeGreaterThanOrEqual(0)
  }))
