import { isCI } from '@systemfsoftware/vitest-config'
import { FastCheck as fc } from 'effect/testing'

/**
 * CI draws tenfold while the shared `testTimeout` only loosens from 8s to 30s,
 * so a property runs about 2.7x tighter against the clock in CI than locally.
 * Measured 2026-08-06: 25 tests, 3.60s of test time locally and 17.24s in CI,
 * slowest single property 4.05s against the 30s cap. Raise `numRuns` only with
 * that headroom re-measured.
 */
fc.configureGlobal({ numRuns: isCI ? 1000 : 100 })
