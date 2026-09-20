import { addEqualityTesters } from '@effect/vitest'
import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'

addEqualityTesters()

if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns: 100 })
}
