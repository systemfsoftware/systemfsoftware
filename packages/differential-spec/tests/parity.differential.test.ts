import { Differential } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import { integers } from './__fixtures__/arbitraries.js'

const referenceDouble = (x: number) => Effect.succeed(x * 2)
const candidateDouble = (x: number) => Effect.succeed(x + x)

Differential.compare({ reference: referenceDouble, candidate: candidateDouble })
  .on(integers)
  .assert((a, b) => a === b)
