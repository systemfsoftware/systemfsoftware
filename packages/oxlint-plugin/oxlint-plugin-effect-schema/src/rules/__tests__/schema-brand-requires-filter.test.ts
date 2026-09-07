import { createRuleTester } from './_tester.js'

import { BRAND_ACTUAL, BRAND_EXPECTED, BRAND_FIX } from '../schema-brand-requires-filter.config.js'
import { schemaBrandRequiresFilter } from '../schema-brand-requires-filter.js'

const ruleTester = createRuleTester()

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

const brandError = (brand: string | null) => ({
  messageId: 'brandWithoutFilter' as const,
  data: {
    name: brand === null ? 'a brand with no runtime filter' : `a brand ('${brand}') with no runtime filter`,
    expected: BRAND_EXPECTED,
    actual: BRAND_ACTUAL,
    fix: BRAND_FIX,
  },
})

/**
 * The shared known-bad corpus for the brand rule: every entry holds a brand
 * whose underlying chain carries no refinement. A later firing suite imports
 * this by name; entries stay in sync with the suite by construction.
 */
export const SCHEMA_BRAND_REQUIRES_FILTER_INVALID = [
  {
    name: 'Should_Fail_When_BrandSitsOnBareString',
    code: `import { Schema } from 'effect'
export const Email = Schema.String.pipe(Schema.brand('Email'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Email')],
  },
  {
    name: 'Should_Fail_When_PipeFunctionHoldsBrandOverBare',
    code: `import { pipe, Schema } from 'effect'
export const Email = pipe(Schema.String, Schema.brand('Email'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Email')],
  },
  {
    name: 'Should_Fail_When_AliasedBrandSitsOnBareNumber',
    code: `import { Schema as S } from 'effect'
export const Count = S.Number.pipe(S.brand('Count'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Count')],
  },
  {
    name: 'Should_Fail_When_NamespacedBrandSitsOnBareBoolean',
    code: `import * as E from 'effect'
export const Flag = E.Schema.Boolean.pipe(E.Schema.brand('Flag'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Flag')],
  },
  {
    name: 'Should_Fail_When_AnnotationIsTheOnlyStepBehindBrand',
    code: `import { Schema } from 'effect'
export const Named = Schema.String.annotate({ identifier: 'Name' }).pipe(Schema.brand('Named'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Named')],
  },
  {
    name: 'Should_FailOncePerBrand_When_TwoBrandsStackOnBare',
    code: `import { Schema } from 'effect'
export const Double = Schema.String.pipe(Schema.brand('A'), Schema.brand('B'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('A'), brandError('B')],
  },
  {
    name: 'Should_Fail_When_BrandSitsOnUnrefinedUnknown',
    code: `import { Schema } from 'effect'
export const Mystery = Schema.Unknown.pipe(Schema.brand('Mystery'))`,
    filename: SCHEMA_FILE,
    errors: [brandError('Mystery')],
  },
  {
    name: 'Should_Fail_When_BrandNameIsNotAStaticString',
    code: `import { Schema } from 'effect'
export const Dynamic = Schema.String.pipe(Schema.brand(makeName()))`,
    filename: SCHEMA_FILE,
    errors: [brandError(null)],
  },
  {
    name: 'Should_Fail_When_BrandOverBareLivesOutsideASchemaFile',
    code: `import { Schema } from 'effect'
export const Email = Schema.String.pipe(Schema.brand('Email'))`,
    filename: '/repo/pkg/src/domain.ts',
    errors: [brandError('Email')],
  },
]

ruleTester.run('schema-brand-requires-filter', schemaBrandRequiresFilter, {
  valid: [
    {
      name: 'Should_Pass_When_MinLengthStandsBehindBrand',
      code: `import { Schema } from 'effect'
export const Name = Schema.String.pipe(Schema.minLength(1), Schema.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_CheckStandsBehindBrand',
      code: `import { Schema } from 'effect'
export const MaxChildren = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 5 })), Schema.brand('MaxChildren'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AliasedCheckStandsBehindBrand',
      code: `import { Schema as S } from 'effect'
export const Positive = S.Number.pipe(S.check((n: number) => n > 0), S.brand('Positive'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_NamespacedPatternStandsBehindBrand',
      code: `import * as E from 'effect'
export const Code = E.Schema.String.pipe(E.Schema.pattern(/^[A-Z]+$/), E.Schema.brand('Code'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SubmoduleRefinementStandsBehindBrand',
      code: `import * as S from 'effect/Schema'
export const Name = S.String.pipe(S.minLength(1), S.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_FilterStandsBehindBrandAfterAnnotation',
      code: `import { Schema } from 'effect'
export const Name = Schema.String.annotate({ identifier: 'Name' }).pipe(Schema.filter((s: string) => s.length > 0), Schema.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandSitsOverAStruct',
      code: `import { Schema } from 'effect'
export const Box = Schema.Struct({ name: Schema.String.pipe(Schema.minLength(1)) }).pipe(Schema.brand('Box'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_TransformStandsBehindBrand',
      code: `import { Schema } from 'effect'
export const Hex = Schema.String.pipe(Schema.decodeTo(Target, { decode: (s: string) => s, encode: (s: string) => s }), Schema.brand('Hex'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandComesFromAForeignModule',
      code: `import { Schema } from './fake-schema.js'
export const Email = Schema.String.pipe(Schema.brand('Email'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandHasNoChainBehindIt',
      code: `import { Schema } from 'effect'
export const lone = Schema.brand('Lone')`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BaseComesFromElsewhere',
      code: `import { Schema } from 'effect'
export const Wrapped = getSchema().pipe(Schema.brand('Wrapped'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_LocalAliasCarriesTheRefinementBehindBrand',
      code: `import { Schema } from 'effect'
const Name = Schema.String.pipe(Schema.minLength(1))
export const Branded = Name.pipe(Schema.brand('Branded'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_PipeComesFromFunctionModule',
      code: `import { pipe } from 'effect/Function'
import { Schema } from 'effect'
export const Name = pipe(Schema.String, Schema.minLength(1), Schema.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: SCHEMA_BRAND_REQUIRES_FILTER_INVALID,
})
