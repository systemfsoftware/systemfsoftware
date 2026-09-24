import { Differential } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import { integerLists, integers } from './__fixtures__/arbitraries.js'

const sameAmount = (a: number, b: number): boolean => a === b

const sameKeptAmounts = (kept: Array<number>, keptAgain: Array<number>): boolean =>
  kept.length === keptAgain.length && kept.every((amount, index) => amount === keptAgain[index])

Differential.compare('a reference and a candidate that both double their amount', {
  reference: (amount: number) => Effect.succeed(amount * 2),
  candidate: (amount: number) => Effect.succeed(amount + amount),
})
  .on(integers)
  .assert(sameAmount)

Differential.compare('a reference and a candidate that keep the same positive amounts', {
  reference: (amounts: Array<number>) => Effect.succeed(amounts.filter((amount) => amount > 0)),
  candidate: (amounts: Array<number>) =>
    Effect.succeed(amounts.reduce<Array<number>>((kept, amount) => (amount > 0 ? [...kept, amount] : kept), [])),
})
  .on(integerLists)
  .assert(sameKeptAmounts)
