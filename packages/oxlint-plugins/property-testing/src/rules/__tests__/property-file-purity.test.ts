import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { propertyFilePurity } from '../property-file-purity.js'

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

const PROPERTY_FILE = 'src/sort.property.test.ts'
const SCENARIO_FILE = 'src/sort.test.ts'
const SNAPSHOT_FILE = 'tests/bounded-union.snapshot.test.ts'

ruleTester.run('property-file-purity', propertyFilePurity, {
  valid: [
    {
      name: 'Should_Pass_When_ItProp_InPropertyFile',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_ItEffectProp_InPropertyFile',
      code: `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { return x === x }))`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_ItPropOnly_InPropertyFile',
      code: `it.prop.only('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_Describe_InPropertyFile',
      code: `describe('sort', () => { it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_FcArbitraryBuilders_InPropertyFile',
      code: `it.prop('∀h_X_=x', [fc.stringMatching(/^0x/)], ([h]) => { fc.pre(h.length > 2); return check(h) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_CheckMethodOnNonFcObject_InPropertyFile',
      code: `it.prop('∀x_X_=x', [a], ([x]) => { xs.check(x); return x === x })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_FastCheckImport_InPropertyFile',
      code: `import { FastCheck as fc } from 'effect'\nit.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_PlainIt_InScenarioFile',
      code: `it('plain test', () => { expect(1).toBe(1) })`,
      filename: SCENARIO_FILE,
    },
    {
      name: 'Should_Pass_When_ExpectInSpecFile',
      code: `it('plain test', () => { expect(1).toBe(1) })`,
      filename: 'src/sort.spec.ts',
    },
    {
      name: 'Should_Pass_When_FastCheckImport_InNonTestFile',
      code:
        `import { type FastCheck, Schema as S } from 'effect'\nconst arb = () => (fc: typeof FastCheck) => fc.string()`,
      filename: 'src/bounded-union.ts',
    },
    {
      name: 'Should_Pass_When_ItProp_InNonTestFile',
      code: `export const laws = (schema) => it.prop('∀x_X_=x', [schema], ([x]) => x === x)`,
      filename: 'src/schema-laws.ts',
    },
    {
      name: 'Should_Pass_When_EffectCallOnNonItObject_InPropertyFile',
      code: `other.effect('x', () => { expect(1).toBe(1) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_EffectOnlyOnNonItObject_InPropertyFile',
      code: `foo.effect.only('x', () => { expect(1).toBe(1) })`,
      filename: PROPERTY_FILE,
    },
    {
      name: 'Should_Pass_When_NamedEffectImport_InScenarioFile',
      code: `import { Schema } from 'effect'\nit('t', () => { expect(1).toBe(1) })`,
      filename: SCENARIO_FILE,
    },
    {
      name: 'Should_Pass_When_DefaultEffectImport_InScenarioFile',
      code: `import Schema from 'effect'\nit('t', () => { expect(1).toBe(1) })`,
      filename: SCENARIO_FILE,
    },
    {
      name: 'Should_Pass_When_FastCheckImport_InSnapshotFile',
      code:
        `import { FastCheck as fc } from 'effect'\nit('snapshot', () => { fc.sample(arb, { seed: 1, numRuns: 10 }) })`,
      filename: SNAPSHOT_FILE,
    },
    {
      name: 'Should_Pass_When_FcSampleCall_WithDifferentSeed_InSnapshotFile',
      code:
        `import { FastCheck as fc } from 'effect'\nit('snapshot', () => { fc.sample(arb, { seed: 2, numRuns: 5 }) })`,
      filename: SNAPSHOT_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_PlainIt_InPropertyFile',
      code: `it('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      filename: PROPERTY_FILE,
      errors: [
        {
          messageId: 'plainIt',
          data: {
            name: 'scenario test (it(...)) in a .property.test.ts file',
            expected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
            actual: 'it(...) runs a single example, not a property',
            fix:
              'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_Test_InPropertyFile',
      code: `test('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      filename: PROPERTY_FILE,
      errors: [{ messageId: 'plainIt' }],
    },
    {
      name: 'Should_Report_When_ItOnly_InPropertyFile',
      code: `it.only('sorts', () => { expect(sort([2, 1])).toEqual([1, 2]) })`,
      filename: PROPERTY_FILE,
      errors: [
        {
          messageId: 'plainIt',
          data: {
            name: 'scenario test (it.only(...)) in a .property.test.ts file',
            expected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
            actual: 'it.only(...) runs a single example, not a property',
            fix:
              'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ItEffect_InPropertyFile',
      code: `it.effect('loads', () => Effect.gen(function*() { assertSome(yield* load()) }))`,
      filename: PROPERTY_FILE,
      errors: [
        {
          messageId: 'plainEffectIt',
          data: {
            name: 'scenario test (it.effect(...)) in a .property.test.ts file',
            expected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
            actual: 'it.effect(...) runs a single example, not a property',
            fix:
              'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ItEffectSkip_InPropertyFile',
      code: `it.effect.skip('loads', () => Effect.gen(function*() { assertSome(yield* load()) }))`,
      filename: PROPERTY_FILE,
      errors: [
        {
          messageId: 'plainEffectIt',
          data: {
            name: 'scenario test (it.effect.skip(...)) in a .property.test.ts file',
            expected: 'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests',
            actual: 'it.effect.skip(...) runs a single example, not a property',
            fix:
              'move the scenario test to a plain *.test.ts file, or rewrite it as a property with arbitraries and a boolean-returning predicate',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FcAssert_InPropertyFile',
      code: `fc.assert(fc.property(fc.integer(), (n) => n === n))`,
      filename: PROPERTY_FILE,
      errors: [{ messageId: 'rawFastCheck' }, { messageId: 'rawFastCheck' }],
    },
    {
      name: 'Should_Report_When_FcCheck_InPropertyFile',
      code: `fc.check(prop)`,
      filename: PROPERTY_FILE,
      errors: [
        {
          messageId: 'rawFastCheck',
          data: {
            name: 'raw fc.check(...) in a .property.test.ts file',
            expected: 'it.prop(...) or it.effect.prop(...) from @effect/vitest',
            actual: 'fc.check(...) bypasses the vitest/Effect integration',
            fix:
              'rewrite as it.prop(name, [arbitraries], predicate) returning a boolean; fc.* stays for building arbitraries (fc.pre, fc.stringMatching, ...)',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_FcAsyncProperty_InPropertyFile',
      code: `const prop = fc.asyncProperty(fc.integer(), async (n) => n === n)`,
      filename: PROPERTY_FILE,
      errors: [{ messageId: 'rawFastCheck' }],
    },
    {
      name: 'Should_Report_When_FastCheckImport_InScenarioFile',
      code: `import { FastCheck as fc } from 'effect'\nit('plain test', () => { expect(1).toBe(1) })`,
      filename: SCENARIO_FILE,
      errors: [
        {
          messageId: 'fastCheckImport',
          data: {
            name: 'FastCheck import in a scenario test file',
            expected: 'property tests (and every FastCheck usage) live in .property.test.ts files',
            actual: 'FastCheck imported by a file that is not .property.test.ts',
            fix: 'move the property test to a *.property.test.ts file; this file keeps plain it() scenario tests only',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_TypeFastCheckImport_InScenarioFile',
      code: `import { type FastCheck } from 'effect'\nit('plain test', () => { expect(1).toBe(1) })`,
      filename: SCENARIO_FILE,
      errors: [{ messageId: 'fastCheckImport' }],
    },
    {
      name: 'Should_Report_When_ItProp_InScenarioFile',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: SCENARIO_FILE,
      errors: [
        {
          messageId: 'propCall',
          data: {
            name: 'property test in a non-property test file',
            expected: 'it.prop / it.effect.prop calls live in .property.test.ts files',
            actual: 'a property test mixed into a test file that is not a property file',
            fix: 'move this test to a *.property.test.ts file — property and non-property tests never mix',
          },
        },
      ],
    },
    {
      name: 'Should_Report_When_ItEffectProp_InScenarioFile',
      code: `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { return x === x }))`,
      filename: SCENARIO_FILE,
      errors: [{ messageId: 'propCall' }],
    },
    {
      name: 'Should_Report_When_ItPropOnly_InSpecFile',
      code: `it.prop.only('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: 'src/sort.spec.ts',
      errors: [{ messageId: 'propCall' }],
    },
    {
      name: 'Should_Report_When_ItProp_InSnapshotFile',
      code: `it.prop('∀n_X_=x', [fc.integer()], ([n]) => n === n)`,
      filename: SNAPSHOT_FILE,
      errors: [{ messageId: 'propCall' }],
    },
    {
      name: 'Should_Report_When_ItEffectProp_InSnapshotFile',
      code: `it.effect.prop('∀x_X_=x', [arb], ([x]) => Effect.gen(function*() { return x === x }))`,
      filename: SNAPSHOT_FILE,
      errors: [{ messageId: 'propCall' }],
    },
  ],
})
