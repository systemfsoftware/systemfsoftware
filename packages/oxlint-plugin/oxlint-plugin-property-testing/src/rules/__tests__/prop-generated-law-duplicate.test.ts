import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { ACTUAL, EXPECTED, FIX, VIOLATION_NAME } from '../prop-generated-law-duplicate.config.js'
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

const EXPECTED_DATA = { name: VIOLATION_NAME, expected: EXPECTED, actual: ACTUAL, fix: FIX }

const GUARD = 'if (import.meta.vitest !== void 0) {'
const GUARD_END = '}'

const SCHEMA_IMPORTS = `import { Schema, Exit } from 'effect'
const { FastCheck: fc } = await import('effect/testing')
const roundTrips = Schema.toArbitrary(Schema.String)(fc)`

ruleTester.run('prop-generated-law-duplicate', propGeneratedLawDuplicate, {
  valid: [
    {
      name: 'Should_StaySilent_When_NoGuard',
      code: `${SCHEMA_IMPORTS}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(s)))`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_ArbitraryIsHandBuilt',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [fc.integer({ min: 0 })], ([n]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(n)))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateStatesARefusal',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isFailure(Schema.decodeUnknownExit(Schema.String)(s)))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateCallsADomainDecision',
      code: `${SCHEMA_IMPORTS}
${GUARD}
const decide = (s: string): boolean => s.length > 0
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(decide(s))))
${GUARD_END}`,
      filename: FILENAME,
    },
    {
      name: 'Should_StaySilent_When_PredicateLeavesCodecVocabulary',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => s.trim().length >= 0)
${GUARD_END}`,
      filename: FILENAME,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PredicateIsPlainDecodeAcceptance',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [roundTrips], ([s]) => Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(s)))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'generatedLawDuplicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateIsARoundTripChain',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [Schema.toArbitrary(Schema.String)(fc)], ([s]) => {
  const encoded = Schema.encodeUnknownExit(Schema.String)(s)
  if (Exit.isFailure(encoded)) return false
  return Exit.isSuccess(Schema.decodeUnknownExit(Schema.String)(encoded.value))
})
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'generatedLawDuplicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_PredicateAssertsEncodedStability',
      code: `${SCHEMA_IMPORTS}
${GUARD}
const equivalent = Schema.toEquivalence(Schema.String)
it.prop('p', [Schema.toArbitrary(Schema.String)(fc)], ([s]) => equivalent(s))
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'generatedLawDuplicate', data: EXPECTED_DATA }],
    },
    {
      name: 'Should_Report_When_SyncDecodeRidesAnUnknownRoundTrip',
      code: `${SCHEMA_IMPORTS}
${GUARD}
it.prop('p', [Schema.toArbitrary(Schema.String)(fc)], ([s]) => Schema.decodeUnknownSync(Schema.String)(s) !== null)
${GUARD_END}`,
      filename: FILENAME,
      errors: [{ messageId: 'generatedLawDuplicate', data: EXPECTED_DATA }],
    },
  ],
})
