import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

describe('the Effect-lane habit name is refused', () => {
  // @ts-expect-error ✗ it.effect is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).
  it.effect('Should_RefuseTheEffectLane_When_TheHabitNameIsCalled', () => Effect.void)
})
