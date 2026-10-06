import { invalidEncodings } from '@systemfsoftware/effect-contract/testing'
import type { Schema } from 'effect'
import * as fc from 'fast-check'
import { getBalance } from './kernel.fixture.js'

export const boundarySamples: ReadonlyArray<Schema.Json> = fc.sample(invalidEncodings(getBalance.input), {
  numRuns: 200,
  seed: 42,
})
