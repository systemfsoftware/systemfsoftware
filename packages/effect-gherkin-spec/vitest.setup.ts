import { addEqualityTesters } from '@effect/vitest'
import { isCI } from '@systemfsoftware/vitest-config'
import { FastCheck as fc } from 'effect/testing'

addEqualityTesters()

const numRuns = 100
if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns })
}
