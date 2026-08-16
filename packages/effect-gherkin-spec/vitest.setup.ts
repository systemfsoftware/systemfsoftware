import { addEqualityTesters } from '@effect/vitest'
import { isCI } from '@systemfsoftware/vitest-config'
import { FastCheck as fc } from 'effect/testing'

addEqualityTesters()

fc.configureGlobal({ numRuns: isCI ? 1000 : 100 })
