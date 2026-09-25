import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

describe('the scoped-lane habit name is refused', () => {
  // @ts-expect-error ✗ it.scoped is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).
  it.scoped('Should_RefuseTheScopedLane_When_TheHabitNameIsCalled', () => Effect.void)
})
