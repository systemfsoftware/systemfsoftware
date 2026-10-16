import { Metamorphic } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import { integerLists } from './__fixtures__/arbitraries.js'

const keepPositives = (amounts: Array<number>) => Effect.succeed(amounts.filter((amount) => amount > 0))

Metamorphic.on({
  name: 'a system that keeps the positive amounts keeps one entry per positive amount',
  system: keepPositives,
})
  .relation({
    transformInput: (amounts: Array<number>) => amounts.map((amount) => amount * 2),
    assertOutput: (baseline: Array<number>, followUp: Array<number>) => followUp.length === baseline.length,
  })
  .on(integerLists)
