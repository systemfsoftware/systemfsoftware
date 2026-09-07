import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

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
} from '../no-ignored-draw.config.js'
import { noIgnoredDraw } from '../no-ignored-draw.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

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

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_END = '}'

ruleTester.run('no-ignored-draw', noIgnoredDraw, {
  valid: [
    {
      name: 'Should_StaySilent_When_DrawIsConsumedByRefusalCheck',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('∀b_BadHex_⊥', [arbitrary], ([value]) => !accepts(schema, value))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_DrawIsConsumedByDiscriminates',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('∀g_BadHex_discriminates', [arbitrary], ([value]) => discriminates(schema, obligations, value))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PartiallyConsumedDrawListReadsSecondDraw',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [genA, genB], ([_a, b]) => b !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_DrawIsConsumedThroughAMember',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [gen], ([draw]) => draw.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_EffectPropConsumesItsDraw',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.effect.prop('p', [gen], ([x]) => x !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_FraudLivesOutsideAGuard',
      code: `import { it } from '@effect/vitest'
it.prop('∀x_Weaken_=Witness', [gen], ([_draw]) => check())`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_TheIfIsNotAnInSourceGuard',
      code: `import { it } from '@effect/vitest'
if (someCondition) {
  it.prop('p', [gen], ([_draw]) => check())
}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_CalleeIsNotAPropertyTest',
      code: `import { it } from '@effect/vitest'
${GUARD}
it('plain test', () => { const x = 1; return x === 1 })
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ConstantFromRidesAForeignNamespace',
      code: `import { it } from '@effect/vitest'
${GUARD}
it.prop('p', [Pool.constantFrom(1, 2, 3)], ([samples]) => samples.length > 0)
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
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
  ],
})
