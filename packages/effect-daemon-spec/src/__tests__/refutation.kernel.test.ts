import { scanObligations } from '@systemfsoftware/effect-schema-law'
import type { Schema as S } from 'effect'
import { expect, it } from 'vitest'
import { DynamicLimitExceeded } from '../daemon-health.schema.js'
import { IntensityConfig, MaxChildren } from '../daemon-policy.schema.js'
import { LeaderLockInfraError, LeaderLockNotAcquired } from '../leader-lock.schema.js'
import { LockPrimitiveError } from '../lock-primitive.schema.js'

const EXPORTED_SCHEMAS: Readonly<Record<string, S.ConstraintDecoder<unknown>>> = {
  DynamicLimitExceeded,
  IntensityConfig,
  LeaderLockInfraError,
  LeaderLockNotAcquired,
  LockPrimitiveError,
  MaxChildren,
}

const RECORDED_MODEL = {
  DynamicLimitExceeded: { obligations: 1, blind: [] },
  IntensityConfig: { obligations: 1, blind: [] },
  LeaderLockInfraError: { obligations: 0, blind: [] },
  LeaderLockNotAcquired: { obligations: 0, blind: [] },
  LockPrimitiveError: { obligations: 0, blind: [] },
  MaxChildren: { obligations: 1, blind: [] },
}

it('Should_MatchTheRecordedObligationModel_When_ScanningEveryRefutableSchema', () => {
  const scanned = Object.fromEntries(
    Object.entries(EXPORTED_SCHEMAS).map(([name, schema]) => {
      const scan = scanObligations(schema)
      return [name, {
        obligations: scan.obligations.size,
        blind: scan.blind.map((arm) => `${arm.kind} at ${arm.path}`),
      }]
    }),
  )
  expect(scanned).toStrictEqual(RECORDED_MODEL)
})
