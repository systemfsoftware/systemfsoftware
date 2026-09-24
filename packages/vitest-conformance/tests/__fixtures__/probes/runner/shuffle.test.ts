import { describe, it } from '@effect/vitest'

const doubled = (n: number): number => n * 2

describe('shuffled pair', () => {
  it('Should_DoubleTwo_When_TheShuffleRunsItFirst', function*({ expect }) {
    yield* expect(doubled(2)).toEqual(4)
  })

  it('Should_DoubleThree_When_TheShuffleRunsItSecond', function*({ expect }) {
    yield* expect(doubled(3)).toEqual(6)
  })
})
