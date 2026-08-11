import { refutes } from '@systemfsoftware/effect-schema-law'
import { type FastCheck, FastCheck as fc } from 'effect'

import { PanicReport } from '../diagnostic.schema.js'

/**
 * Refusal laws only — acceptance laws for these schemas are generated into
 * schema-laws.test.ts. `PanicReport` has five refinement obligations: the
 * `≥ 0` bound on each of the four count fields, plus the shared `Int`
 * refinement (one memoized node across all four fields, so only a fractional
 * `found` draw discriminates it). Each generator violates exactly one node so
 * the corresponding weakening accepts the draw.
 */

const bypassed = fc.constantFrom({ kind: 'bypassed' })
const validCount = fc.integer({ min: 0 })
const base = (
  overrides: Record<string, FastCheck.Arbitrary<unknown>>,
): Record<string, FastCheck.Arbitrary<unknown>> => ({
  found: validCount,
  shields: bypassed,
  supervisorsKilled: validCount,
  vault: fc.constant('destroyed'),
  ...overrides,
})

const negativeFound = fc.record(base({ found: fc.integer({ max: -1 }) }))
const fractionalFound = fc.record(base({ found: fc.constant(1.5) }))
const negativeSupervisorsKilled = fc.record(base({ supervisorsKilled: fc.integer({ max: -1 }) }))
const negativeShieldCount = fc.record(base({ shields: fc.constantFrom({ kind: 'raised', count: -1 }) }))
const negativeKilledCount = fc.record(base({ containersKilled: fc.constantFrom({ count: -1 }) }))

refutes(PanicReport, {
  NegativeFound: negativeFound,
  FractionalFound: fractionalFound,
  NegativeSupervisorsKilled: negativeSupervisorsKilled,
  NegativeShieldCount: negativeShieldCount,
  NegativeKilledCount: negativeKilledCount,
})
