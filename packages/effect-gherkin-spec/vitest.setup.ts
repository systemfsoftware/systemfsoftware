import { addEqualityTesters } from '@effect/vitest'
import { isCI } from '@systemfsoftware/vitest-config'
import * as fc from 'fast-check'

addEqualityTesters()

fc.configureGlobal({ numRuns: isCI ? 1000 : 100 })
