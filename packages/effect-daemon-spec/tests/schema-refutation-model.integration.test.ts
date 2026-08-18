import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { scanObligations } from '@systemfsoftware/effect-schema-law'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { DynamicLimitExceeded } from '../src/DaemonHealth.schema.js'
import { IntensityConfig, MaxChildren } from '../src/DaemonPolicy.schema.js'
import { LeaderLockInfraError, LeaderLockNotAcquired } from '../src/LeaderLock.schema.js'
import { LockPrimitiveError } from '../src/LockPrimitive.schema.js'

/**
 * The obligation model, recomputed from each schema's own AST rather than restated.
 *
 * `scanObligations` walks the constraint decoder and counts the refinements a refutation
 * generator must discharge, plus the arms it cannot reach. Adding a refinement to any
 * schema below, or nesting one where the walker goes blind, moves a number here — which is
 * the whole point: the recorded model is the observation, the schemas are the subject.
 */
const RECORDED_MODEL = {
  DynamicLimitExceeded: { obligations: 1, blind: [] },
  IntensityConfig: { obligations: 1, blind: [] },
  LeaderLockInfraError: { obligations: 0, blind: [] },
  LeaderLockNotAcquired: { obligations: 0, blind: [] },
  LockPrimitiveError: { obligations: 0, blind: [] },
  MaxChildren: { obligations: 1, blind: [] },
}

const EXPORTED_SCHEMAS = {
  DynamicLimitExceeded,
  IntensityConfig,
  LeaderLockInfraError,
  LeaderLockNotAcquired,
  LockPrimitiveError,
  MaxChildren,
}

const Feature = makeFeature({ it, layer })
Feature('Refutable schema refinement model')
  .body(({ scenario }) => {
    scenario(
      'every exported refutable schema scans to its recorded obligation count',
      Gherkin.Do.pipe(
        Given('every exported refutable schema scanned for obligations')(
          'scanned',
          () =>
            Effect.sync(() =>
              Object.fromEntries(
                Object.entries(EXPORTED_SCHEMAS).map(([name, schema]) => {
                  const scan = scanObligations(schema)
                  return [name, {
                    obligations: scan.obligations.size,
                    blind: scan.blind.map((arm) => `${arm.kind} at ${arm.path}`),
                  }]
                }),
              )
            ),
        ),
        Then('the scan matches the recorded model exactly')((s) =>
          Effect.sync(() => {
            expect(s.scanned).toStrictEqual(RECORDED_MODEL)
          })
        ),
      ),
    )
  })
