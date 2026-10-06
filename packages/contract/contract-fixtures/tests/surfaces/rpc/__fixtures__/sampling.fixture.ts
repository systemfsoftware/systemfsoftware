import type { Contract } from '@systemfsoftware/effect-contract'
import { invalidEncodings, validInputs } from '@systemfsoftware/effect-contract/testing'
import type { Schema } from 'effect'
import * as fc from 'fast-check'

export const sampledInputs = (config: {
  readonly input: Contract.InputSchema
  readonly count: number
  readonly seed: number
}): readonly Schema.Json[] => [
  ...fc.sample(validInputs(config.input), { numRuns: config.count, seed: config.seed }),
  ...fc.sample(invalidEncodings(config.input), { numRuns: config.count, seed: config.seed + 1 }),
]
