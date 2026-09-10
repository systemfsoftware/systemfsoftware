import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'

fc.configureGlobal({ numRuns: isCI ? 1000 : 100 })
