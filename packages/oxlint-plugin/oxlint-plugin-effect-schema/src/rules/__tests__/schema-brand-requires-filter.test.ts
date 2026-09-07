import { createRuleTester } from './_tester.js'

import { SCHEMA_BRAND_REQUIRES_FILTER_INVALID } from '../schema-brand-requires-filter.corpus.js'
import { schemaBrandRequiresFilter } from '../schema-brand-requires-filter.js'

const ruleTester = createRuleTester()

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

ruleTester.run('schema-brand-requires-filter', schemaBrandRequiresFilter, {
  valid: [
    {
      name: 'Should_Pass_When_MinLengthStandsBehindBrand',
      code: `import { Schema } from 'effect'
export const Name = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand('Name'))`,
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
export const Code = E.Schema.String.check(E.Schema.isPattern(/^[A-Z]+$/)).pipe(E.Schema.brand('Code'))`,
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
export const Box = Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) }).pipe(Schema.brand('Box'))`,
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
const Name = Schema.String.check(Schema.isMinLength(1))
export const Branded = Name.pipe(Schema.brand('Branded'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_PipeComesFromFunctionModule',
      code: `import { pipe } from 'effect/Function'
import { Schema } from 'effect'
export const Name = pipe(Schema.String.check(Schema.isMinLength(1)), Schema.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: SCHEMA_BRAND_REQUIRES_FILTER_INVALID,
})
