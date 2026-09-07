import type { RuleTester } from 'oxlint/plugins-dev'

import {
  CONSTANT_ACTUAL,
  CONSTANT_EXPECTED,
  CONSTANT_FIX,
  CONSTANT_NAME,
  SUPPRESSED_ACTUAL,
  SUPPRESSED_EXPECTED,
  SUPPRESSED_FIX,
  SUPPRESSED_NAME,
  UNREFERENCED_ACTUAL,
  UNREFERENCED_EXPECTED,
  UNREFERENCED_FIX,
  UNREFERENCED_NAME,
} from './no-ignored-draw.config.js'

export const GUARD = 'if (import.meta.vitest !== void 0) {'
export const GUARD_END = '}'

const FILENAME = 'src/ProbeString.property.test.ts'

const SUPPRESSED_DATA = {
  name: SUPPRESSED_NAME,
  expected: SUPPRESSED_EXPECTED,
  actual: SUPPRESSED_ACTUAL,
  fix: SUPPRESSED_FIX,
}
const CONSTANT_DATA = {
  name: CONSTANT_NAME,
  expected: CONSTANT_EXPECTED,
  actual: CONSTANT_ACTUAL,
  fix: CONSTANT_FIX,
}
const UNREFERENCED_DATA = {
  name: UNREFERENCED_NAME,
  expected: UNREFERENCED_EXPECTED,
  actual: UNREFERENCED_ACTUAL,
  fix: UNREFERENCED_FIX,
}

export const NO_IGNORED_DRAW_INVALID: RuleTester.InvalidTestCase[] = [
  {
    name: 'Should_Report_When_AdequacyPinIgnoresItsDrawAndUsesAConstant',
    code: `import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
${GUARD}
it.prop('∀s_ProbeString_adequate', [fc.constant(0)], ([_draw]) => adequacyReport(schema, generators).adequate)
${GUARD_END}`,
    filename: FILENAME,
    errors: [
      { messageId: 'constantArbitrary', data: CONSTANT_DATA },
      { messageId: 'suppressedDraw', data: SUPPRESSED_DATA },
    ],
  },
  {
    name: 'Should_Report_When_WeakenWitnessPinIgnoresItsDraw',
    code: `import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
${GUARD}
it.prop('∀x_Weaken_=Witness', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
  const arms = armsOf(RefinedHex)
  if (arms.length === 0) return false
  const obligations = obligationsOf(RefinedHex)
  if (obligations.size === 0) return false
  const first = [...obligations.values()][0]
  if (first === undefined) return false
  const weakened = S.make(first.weakened)
  return accepts(weakened, first.witness) && !accepts(RefinedHex, first.witness)
})
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_AdequacyComparisonPinIgnoresItsDraw',
    code: `import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
${GUARD}
it.prop('∀x_Refutes_∈Adequate', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
  const badArb = S.toArbitrary(BadHex)(fc)
  const withRefusal = adequacyReport(RefinedHex, { BadHex: badArb })
  const withoutRefusal = adequacyReport(RefinedHex, {})
  return withRefusal.adequate && !withoutRefusal.adequate
})
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_VacuousPinIgnoresItsDraw',
    code: `import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
${GUARD}
it.prop('∀x_Vacuous_∈Empty', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
  const arms = armsOf(Plain)
  const report = adequacyReport(Plain, {})
  return arms.length === 0 && report.adequate && report.message.includes('vacuous')
})
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_RoutePinIgnoresItsDraw',
    code: `import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
${GUARD}
it.prop('∀x_Unknown_∈Route', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
  const entry = unsupportedShapeOf(UnknownLike.ast)
  if (entry === undefined) return false
  return entry.coverageRoute.includes('U1')
})
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_ConstantFromSuppliesTheArbitrary',
    code: `import { it } from '@effect/vitest'
import * as fc from 'fast-check'
${GUARD}
it.prop('p', [fc.constantFrom('permanent', 'transient', 'temporary')], ([r]) => r !== null)
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'constantArbitrary', data: CONSTANT_DATA }],
  },
  {
    name: 'Should_Report_When_EveryDrawInTheListIsSuppressed',
    code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [genA, genB], ([_a, _b]) => check())
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_NonUnderscoreDrawIsNeverReferenced',
    code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [gen], ([draw]) => accepts(schema, fixedValue))
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'unreferencedDraw', data: UNREFERENCED_DATA }],
  },
  {
    name: 'Should_Report_When_EffectPropIgnoresItsDraw',
    code: `import { it } from '@effect/vitest'
${GUARD}
it.effect.prop('p', [gen], ([_draw]) => check())
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_FraudHidesInTheElseBranch',
    code: `import { it } from '@effect/vitest'
if (import.meta.vitest) {
} else {
  it.prop('p', [gen], ([_draw]) => check())
}
`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_DescribeWrapsTheFraud',
    code: `import { it } from '@effect/vitest'
${GUARD}
describe('d', () => {
  it.prop('p', [gen], ([_draw]) => check())
})
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
  {
    name: 'Should_Report_When_OnlyModifierCarriesTheFraud',
    code: `import { it } from '@effect/vitest'
${GUARD}
it.prop.only('p', [gen], ([_draw]) => check())
${GUARD_END}`,
    filename: FILENAME,
    errors: [{ messageId: 'suppressedDraw', data: SUPPRESSED_DATA }],
  },
]
