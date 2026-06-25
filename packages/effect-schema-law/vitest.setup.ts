import { addEqualityTesters } from '@effect/vitest'
import { configureGlobal } from 'fast-check'
import { env } from 'node:process'

addEqualityTesters()

const isCi = typeof env.CI === 'string' && env.CI.length > 0
if (isCi) {
  configureGlobal({ numRuns: 1000 })
} else {
  configureGlobal({ numRuns: 100 })
}
