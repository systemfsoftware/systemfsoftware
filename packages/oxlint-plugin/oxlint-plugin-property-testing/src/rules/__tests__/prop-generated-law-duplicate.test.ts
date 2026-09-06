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
const { FastCheck: fc } = await import('effect/testing')
const roundTrips = Schema.toArbitrary(Schema.String)(fc)
const decide = (s: string): boolean => s.length > 0`

ruleTester.run('prop-generated-law-duplicate', propGeneratedLawDuplicate, {
  valid: [
    {
      name: 'Should_StaySilent_When_NoGuard',
      code: `${SCHEMA_IMPORTS}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(s)))`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsAModuleArrow',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => decide(s))
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
it.prop('p', [roundTrips], ([s]) => widen(s) !== s || s.length >= 0)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsAnImportedDomainFunction',
      code: `${SCHEMA_IMPORTS}
import { narrowMoney } from './money.js'
${GUARD}
it.prop('p', [roundTrips], ([s]) => narrowMoney(s) !== null)
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_CodecWrapsADomainFunction',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(decide(s))))
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PredicateIsDecodeAcceptanceOnly',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(s)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'noDomainFunction', data: NO_FUNCTION_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateIsDecodeRefusalOnly',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isFailure(Schema.decodeUnknownExit(Schema.String)(s)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'noDomainFunction', data: NO_FUNCTION_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateRestatesTheDeclaration',
      code: `${SCHEMA_IMPORTS}
const decode = Schema.decodeUnknownExit(Schema.String)
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(decode(s)))
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
it.prop('p', [roundTrips], ([s]) => Object.getOwnPropertySymbols(produce(s)).some((sym) => sym === MoneyTypeId))
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
it.prop('p', [roundTrips], ([s]) => produce(s).value === s && MoneyTypeId !== undefined)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'compilerDuplicate', data: COMPILER_DATA }],
    },
  ],
})
