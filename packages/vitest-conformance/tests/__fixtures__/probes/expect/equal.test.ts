import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { Equal } from 'effect'
import { Hash } from 'effect'

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
}

it.effect('Should_PassToEqual_When_TwoMoneyShareACentsValue', () =>
  Effect.sync(() => expect(Money.of(1)).toEqual(Money.of(1))))
