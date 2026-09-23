import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'

if (isCI) {
  fc.configureGlobal({ numRuns: 1000 })
} else {
  fc.configureGlobal({ numRuns: 100 })
}
