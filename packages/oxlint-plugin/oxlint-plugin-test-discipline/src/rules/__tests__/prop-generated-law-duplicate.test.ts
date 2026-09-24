import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  COMPILER_ACTUAL,
  COMPILER_EXPECTED,
  COMPILER_FIX,
  COMPILER_NAME,
  NO_FUNCTION_ACTUAL,
  NO_FUNCTION_EXPECTED,
  NO_FUNCTION_FIX,
  NO_FUNCTION_NAME,
} from '../prop-generated-law-duplicate.config.js'
import { propGeneratedLawDuplicate } from '../prop-generated-law-duplicate.js'

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

const FILENAME = 'src/money.schema.ts'

const COMPILER_DATA = { name: COMPILER_NAME, expected: COMPILER_EXPECTED, actual: COMPILER_ACTUAL, fix: COMPILER_FIX }
const NO_FUNCTION_DATA = {
  name: NO_FUNCTION_NAME,
  expected: NO_FUNCTION_EXPECTED,
  actual: NO_FUNCTION_ACTUAL,
  fix: NO_FUNCTION_FIX,
}

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_END = '}'

const SCHEMA_IMPORTS = `import { Schema, Exit } from 'effect'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
const roundTrips = Arbitrary.schema(Schema.String)
const decide = (s: string): boolean => s.length > 0`

ruleTester.run('prop-generated-law-duplicate', propGeneratedLawDuplicate, {
  valid: [
    {
      name: 'Should_StaySilent_When_NoGuard',
      code: `${SCHEMA_IMPORTS}
it.prop('p', { of: [roundTrips], subject: (s) => s, runs: 100 }, (s, [v]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(v)))`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsAModuleArrow',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', { of: [roundTrips], subject: decide, runs: 100 }, (s, [v]) => decide(v))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsAModuleFunctionDeclaration',
      code: `${SCHEMA_IMPORTS}
function widen(s: string): string {
  return s.trim()
}
${GUARD}
it.prop('p', { of: [roundTrips], subject: widen, runs: 100 }, (s, [v]) => widen(v) !== v || v.length >= 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsAnImportedDomainFunction',
      code: `${SCHEMA_IMPORTS}
import { narrowMoney } from './money.js'
${GUARD}
it.prop('p', { of: [roundTrips], subject: narrowMoney, runs: 100 }, (s, [v]) => narrowMoney(v) !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_CodecWrapsADomainFunction',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', { of: [roundTrips], subject: decide, runs: 100 }, (s, [v]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(decide(v))))
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PredicateIsDecodeAcceptanceOnly',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', { of: [roundTrips], subject: (s) => s, runs: 100 }, (s, [v]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(v)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'noDomainFunction', data: NO_FUNCTION_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateIsDecodeRefusalOnly',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', { of: [roundTrips], subject: (s) => s, runs: 100 }, (s, [v]) => Exit.isFailure(Schema.decodeUnknownExit(Schema.String)(v)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'noDomainFunction', data: NO_FUNCTION_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateRestatesTheDeclaration',
      code: `${SCHEMA_IMPORTS}
const decode = Schema.decodeUnknownExit(Schema.String)
${GUARD}
it.prop('p', { of: [roundTrips], subject: decode, runs: 100 }, (s, [v]) => Exit.isSuccess(decode(v)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'noDomainFunction', data: NO_FUNCTION_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateProbesBrandSymbols',
      code: `${SCHEMA_IMPORTS}
const produce = (s: string) => ({ value: s })
const MoneyTypeId = Symbol.for('money')
${GUARD}
it.prop('p', { of: [roundTrips], subject: produce, runs: 100 }, (s, [v]) => Object.getOwnPropertySymbols(produce(v)).some((sym) => sym === MoneyTypeId))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'compilerDuplicate', data: COMPILER_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateNamesABrandTypeId',
      code: `${SCHEMA_IMPORTS}
const produce = (s: string) => ({ value: s })
const MoneyTypeId = Symbol.for('money')
${GUARD}
it.prop('p', { of: [roundTrips], subject: produce, runs: 100 }, (s, [v]) => produce(v).value === v && MoneyTypeId !== undefined)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'compilerDuplicate', data: COMPILER_DATA }],
    },
  ],
})
