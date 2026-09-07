import { createRuleTester } from './_tester.js'

import { SCHEMA_BRAND_REQUIRES_DECODE_INVALID } from '../schema-brand-requires-decode.corpus.js'
import { schemaBrandRequiresDecode } from '../schema-brand-requires-decode.js'

const ruleTester = createRuleTester()

const SCHEMA_FILE = '/repo/pkg/src/domain.ts'

ruleTester.run('schema-brand-requires-decode', schemaBrandRequiresDecode, {
  valid: [
    {
      name: 'Should_Pass_When_IdentityBrandSitsOnBareString',
      code: `import { Schema } from 'effect'
export const FailureMessage = Schema.String.pipe(Schema.brand('FailureMessage'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AliasedIdentityBrandSitsOnBareNumber',
      code: `import { Schema as S } from 'effect'
export const Count = S.Number.pipe(S.brand('Count'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_NamespacedIdentityBrandSitsOnBareBoolean',
      code: `import * as E from 'effect'
export const Flag = E.Schema.Boolean.pipe(E.Schema.brand('Flag'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_IdentityBrandSitsOnUnrefinedUnknown',
      code: `import { Schema } from 'effect'
export const Mystery = Schema.Unknown.pipe(Schema.brand('Mystery'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_CheckStandsBehindBrand',
      code: `import { Schema } from 'effect'
export const Name = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Z]+$/)), Schema.brand('Name'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandCheckCarriesACheck',
      code: `import { Brand, Schema } from 'effect'
export const make = Brand.check(Schema.isPattern(/^[A-Z]+$/))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BareCheckCarriesACheck',
      code: `import { check } from 'effect/Brand'
import { Schema } from 'effect'
export const make = check(Schema.isPattern(/^[A-Z]+$/))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_NominalComesFromAForeignModule',
      code: `import { Brand } from './foreign-brand.js'
export const make = Brand.nominal()`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ZeroArgCheckComesFromAForeignModule',
      code: `import { check } from './foreign-brand.js'
export const make = check()`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandLivesInATypePosition',
      code: `import { Brand } from 'effect'
export type FailureMessage = string & Brand.Brand<'FailureMessage'>`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: SCHEMA_BRAND_REQUIRES_DECODE_INVALID,
})
