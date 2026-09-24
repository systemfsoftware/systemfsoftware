import { describe, it } from '@effect/vitest'
import { Effect, Equal, Hash } from 'effect'

class Money implements Equal.Equal {
  constructor(readonly cents: number) {}
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Money && that.cents === this.cents
  }
  [Hash.symbol](): number {
    return Hash.hash(this.cents)
  }
  static of(cents: number): Money {
    return new Money(cents)
  }
  plus(that: Money): Money {
    return new Money(this.cents + that.cents)
  }
}

describe('a kept matcher', () => {
  it('Should_CountTheCheck_When_TheKeptMatcherPasses', function*({ expect }) {
    yield* expect(Money.of(110).plus(Money.of(220))).toEqual(Money.of(330))
  })

  it('Should_StopTheTest_When_TheKeptMatcherFails', function*({ expect }) {
    yield* expect({ total: Money.of(110).plus(Money.of(220)) }).toEqual({ total: Money.of(331) })
    yield* Effect.die('SIDE EFFECT RAN')
  })
})
