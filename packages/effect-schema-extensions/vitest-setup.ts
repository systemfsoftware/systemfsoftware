import { isCI } from '@systemfsoftware/vitest-config'
import { FastCheck as fc } from 'effect/testing'

if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns: 100 })
}
