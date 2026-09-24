import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'
const numRuns = 100
if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns })
}
