import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'

const doubled = (n: number): number => n * 2

describe('shuffled pair', () => {
  it.effect('Should_DoubleTwo_When_TheShuffleRunsItFirst', () => Effect.sync(() => expect(doubled(2)).toEqual(4)))

  it.effect('Should_DoubleThree_When_TheShuffleRunsItSecond', () => Effect.sync(() => expect(doubled(3)).toEqual(6)))
})
