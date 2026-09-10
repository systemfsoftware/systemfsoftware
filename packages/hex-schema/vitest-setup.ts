import { addEqualityTesters } from '@effect/vitest'
import * as fc from 'fast-check'
import { env } from 'node:process'

addEqualityTesters()

const isCi = typeof env['CI'] === 'string' && env['CI'].length > 0
if (isCi) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns: 100 })
}
