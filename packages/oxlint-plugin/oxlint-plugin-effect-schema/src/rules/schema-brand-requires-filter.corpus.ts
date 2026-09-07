import { BRAND_ACTUAL, BRAND_EXPECTED, BRAND_FIX } from './schema-brand-requires-filter.config.js'

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
