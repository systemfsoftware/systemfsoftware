import { expect, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'

const seen = Ref.makeUnsafe(0)

it.effect.each([{ row: 1 }, { row: 2 }])(
  'Should_FailTheSecondRun_When_ARowAdvancesACounter',
  () =>
    Effect.gen(function*() {
      const at = yield* Ref.getAndUpdate(seen, (n) => n + 1)
      expect(at).toEqual(0)
    }),
)
