import {
  MIXED_FAST_CHECK_IMPORT_DATA,
  MIXED_PROP_CALL_DATA,
  PLAIN_EXPECTED,
  PLAIN_FIX,
  RAW_FAST_CHECK_ACTUAL,
  RAW_FAST_CHECK_EXPECTED,
  RAW_FAST_CHECK_FIX,
} from '../property-file-purity.config.js'
import { propertyFilePurity } from '../property-file-purity.js'
import { createRuleTester, everywhere } from './_tester.js'

const ruleTester = createRuleTester()

const PROPERTY_FILE = '/repo/pkg/src/__tests__/sort.workflow.property.test.ts'
const FAST_CHECK = `import { FastCheck as fc } from 'effect'\n`
const A_PROPERTY = `it.prop('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)\n`

const plainError = (messageId: 'plainIt' | 'plainEffectIt', actual: string) => ({
  messageId,
  data: {
    name: `scenario test (${actual}) in a property test file`,
    expected: PLAIN_EXPECTED,
    actual: `${actual} runs a single example, not a property`,
    fix: PLAIN_FIX,
  },
})

const rawFastCheckError = (method: string) => ({
  messageId: 'rawFastCheck' as const,
  data: {
    name: `raw fc.${method}(...) in a property test file`,
    expected: RAW_FAST_CHECK_EXPECTED,
    actual: `fc.${method}(...) ${RAW_FAST_CHECK_ACTUAL}`,
    fix: RAW_FAST_CHECK_FIX,
  },
})

const mixedImport = { messageId: 'fastCheckImport' as const, data: MIXED_FAST_CHECK_IMPORT_DATA }
const mixedCall = { messageId: 'propCall' as const, data: MIXED_PROP_CALL_DATA }

const GHERKIN = `import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'\n`
const CONFORMANCE = `import { Conformance } from '@systemfsoftware/conformance-spec'\n`
const TRACE = `import { TraceSpec } from '@systemfsoftware/trace-spec'\n`

ruleTester.run('property-file-purity', propertyFilePurity, {
  valid: [
    ...everywhere({
      name: 'Should_Pass_When_ItProp_InPropertyFile',
      code: A_PROPERTY,
    }),
    {
      name: 'Should_Pass_When_ItEffectProp_InPropertyFile',
      code:
        `it.effect.prop('∀x_X_=x', { of: [arb], subject: (x) => x, runs: 100 }, (s, [v]) => Effect.gen(function*() { return v === v }))`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_ItPropOnly_InPropertyFile',
      code: `it.prop.only('∀n_X_=x', { of: [fc.integer()], subject: (n) => n, runs: 100 }, (s, [v]) => v === v)`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_Describe_InPropertyFile',
      code: `describe('sort', () => { ${A_PROPERTY} })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_FcArbitraryBuilders_InPropertyFile',
      code:
        `${FAST_CHECK}it.prop('∀h_X_=x', { of: [fc.stringMatching(/^0x/)], subject: (h) => h, runs: 100 }, (s, [v]) => { fc.pre(v.length > 2); return check(v) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_CheckMethodOnNonFcObject_InPropertyFile',
      code:
        `it.prop('∀x_X_=x', { of: [a], subject: (x) => x, runs: 100 }, (s, [v]) => { xs.check(v); return v === v })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_EffectCallOnNonItObject_InPropertyFile',
      code: `${FAST_CHECK}other.effect('x', () => { expect(1).toBe(1) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_EffectOnlyOnNonItObject_InPropertyFile',
      code: `${FAST_CHECK}foo.effect.only('x', () => { expect(1).toBe(1) })`,
      filename: PROPERTY_FILE,
    },
    ...everywhere({
      name: 'Should_Pass_When_PlainIt_And_NoFastCheckOrPropertyCall',
      code: `import { Schema } from 'effect'\nit('plain test', () => { expect(1).toBe(1) })`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_PlainIt_And_TheFastCheckImportIsTypeOnly',
      code: `import { type FastCheck } from 'effect'\nit('plain test', () => { expect(1).toBe(1) })`,
    }),
    ...everywhere({
      name: 'Should_Pass_When_PlainIt_InADifferentialTestThatImportsFastCheck',
      code:
        `import { Differential } from '@systemfsoftware/differential-spec'\nimport * as fc from 'fast-check'\nit('compares', () => {})`,
    }),
    {
      name: 'Should_Pass_When_ItProp_InNonTestFile',
      code:
        `export const laws = (schema) => it.prop('∀x_X_=x', { of: [schema], subject: (x) => x, runs: 100 }, (s, [v]) => v === v)\nit('plain', () => {})`,
      filename: '/repo/pkg/src/schema-laws.ts',
    },
  ],
  invalid: [
    ...everywhere({
      name: 'Should_Report_PlainIt_When_TheFileAlsoDeclaresAProperty',
      code: `${A_PROPERTY}it('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      errors: [plainError('plainIt', 'it(...)')],
    }),
    ...everywhere({
      name: 'Should_Report_PlainIt_When_TheOnlyPropertySignalIsAFastCheckImport',
      code: `import * as fc from 'fast-check'\nit('snapshot', () => { fc.sample(arb, { seed: 1, numRuns: 10 }) })`,
      errors: [plainError('plainIt', 'it(...)')],
    }),
    {
      name: 'Should_Report_PlainIt_When_FastCheckIsImportedFromEffect',
      code: `${FAST_CHECK}it('snapshot', () => { fc.sample(arb, { seed: 1, numRuns: 10 }) })`,
      filename: '/repo/pkg/tests/codec-snapshot.test.ts',
      errors: [plainError('plainIt', 'it(...)')],
    },
    {
      name: 'Should_Report_PlainIt_When_TestIsCalledInAPropertyFile',
      code: `${A_PROPERTY}test('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      filename: PROPERTY_FILE,
      errors: [plainError('plainIt', 'test(...)')],
    },
    {
      name: 'Should_Report_PlainIt_When_ItOnlyIsCalledInAPropertyFile',
      code: `${A_PROPERTY}it.only('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      filename: PROPERTY_FILE,
      errors: [plainError('plainIt', 'it.only(...)')],
    },
    {
      name: 'Should_Report_PlainEffectIt_When_ItEffectIsCalledInAPropertyFile',
      code: `${A_PROPERTY}it.effect('loads', () => Effect.gen(function*() { assertSome(yield* load()) }))`,
      filename: PROPERTY_FILE,
      errors: [plainError('plainEffectIt', 'it.effect(...)')],
    },
    {
      name: 'Should_Report_PlainEffectIt_When_ItEffectSkipIsCalledInAPropertyFile',
      code: `${A_PROPERTY}it.effect.skip('loads', () => Effect.gen(function*() { assertSome(yield* load()) }))`,
      filename: PROPERTY_FILE,
      errors: [plainError('plainEffectIt', 'it.effect.skip(...)')],
    },
    ...everywhere({
      name: 'Should_Report_RawFastCheck_When_FcAssertRunsAProperty',
      code: `${FAST_CHECK}fc.assert(fc.property(fc.integer(), (n) => n === n))`,
      errors: [rawFastCheckError('assert'), rawFastCheckError('property')],
    }),
    {
      name: 'Should_Report_RawFastCheck_When_FcCheckRunsAProperty',
      code: `${FAST_CHECK}fc.check(prop)`,
      filename: PROPERTY_FILE,
      errors: [rawFastCheckError('check')],
    },
    {
      name: 'Should_Report_RawFastCheck_When_FcAsyncPropertyIsBuilt',
      code: `${FAST_CHECK}const prop = fc.asyncProperty(fc.integer(), async (n) => n === n)`,
      filename: PROPERTY_FILE,
      errors: [rawFastCheckError('asyncProperty')],
    },
    ...everywhere({
      name: 'Should_ReportTheImportAndTheProperty_When_ABehaviourTestAlsoHoldsAProperty',
      code: `${GHERKIN}import * as fc from 'fast-check'\n${A_PROPERTY}`,
      errors: [mixedImport, mixedCall],
    }),
    ...everywhere({
      name: 'Should_ReportTheProperty_When_AConformanceTestCallsItPropWithoutImportingFastCheck',
      code: `${CONFORMANCE}${A_PROPERTY}`,
      errors: [mixedCall],
    }),
    ...everywhere({
      name: 'Should_ReportTheNamedFastCheckImport_When_ATraceTestImportsItFromEffect',
      code: `${TRACE}${FAST_CHECK}it('x', () => { fc.sample(arb, { seed: 1, numRuns: 10 }) })`,
      errors: [mixedImport],
    }),
  ],
})
