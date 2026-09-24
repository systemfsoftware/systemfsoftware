import { Differential } from '@systemfsoftware/differential-spec'
import { observed, programs, specified } from './__fixtures__/registry-program.fixture.js'

Differential.compare({ reference: specified, candidate: observed })
  .on(programs, { runBudget: 500 })
  .assert((expected, actual) => expected.length === actual.length && expected.every((line, i) => line === actual[i]))
