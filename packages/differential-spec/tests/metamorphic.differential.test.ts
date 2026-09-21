import { Metamorphic } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import { integerLists } from './__fixtures__/arbitraries.js'

const keepPositives = (xs: number[]) => Effect.succeed(xs.filter((x) => x > 0))

Metamorphic.on(keepPositives)
  .relation({
    transformInput: (xs) => xs.map((x) => x * 2),
    assertOutput: (baseline, followUp) => followUp.length === baseline.length,
  })
  .on(integerLists)
