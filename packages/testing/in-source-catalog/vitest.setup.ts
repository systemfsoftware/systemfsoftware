import { isCI } from '@systemfsoftware/vitest-config'
import { FastCheck as fc } from 'effect/testing'

/**
 * CI draws tenfold while the shared `testTimeout` only loosens from 8s to 30s,
 * so a property runs about 2.7x tighter against the clock in CI than locally.
 * Raise `numRuns` only with that headroom re-measured.
 */
fc.configureGlobal({ numRuns: isCI ? 1000 : 100 })
