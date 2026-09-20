import { addEqualityTesters } from '@effect/vitest'
import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'

addEqualityTesters()

const numRuns = 100
if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns })
}
