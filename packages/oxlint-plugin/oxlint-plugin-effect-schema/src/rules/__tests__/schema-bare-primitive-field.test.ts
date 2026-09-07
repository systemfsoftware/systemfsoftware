import { createRuleTester } from './_tester.js'

import { SCHEMA_BARE_PRIMITIVE_FIELD_INVALID } from '../schema-bare-primitive-field.corpus.js'
import { schemaBarePrimitiveField } from '../schema-bare-primitive-field.js'

const ruleTester = createRuleTester()

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

ruleTester.run('schema-bare-primitive-field', schemaBarePrimitiveField, {
  valid: [
    {
      name: 'Should_Pass_When_StringFieldCarriesMinLength',
      code: `import { Schema } from 'effect'
export const User = Schema.Struct({ email: Schema.String.check(Schema.isMinLength(1)) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AliasedFieldCarriesCheck',
      code: `import { Schema as S } from 'effect'
export const User = S.Struct({ name: S.String.pipe(S.check((s: string) => s.length > 0)) })`,
      filename: '/repo/pkg/src/domain.ts',
    },
    {
      name: 'Should_Pass_When_NamespacedFieldIsAlreadyRefined',
      code: `import * as E from 'effect'
export const Counter = E.Schema.Struct({ count: E.Schema.Int })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SubmoduleMembersAreRefined',
      code: `import { Int, Struct } from 'effect/Schema'
export const Counter = Struct({ count: Int })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandedFieldCarriesCheckBehindIt',
      code: `import { Schema } from 'effect'
const MAX = 10
export const Policy = Schema.Struct({ max: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: MAX })), Schema.brand('MaxChildren')) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_RefinementFollowsAnAnnotation',
      code: `import { Schema } from 'effect'
export const User = Schema.Struct({ name: Schema.String.annotate({ identifier: 'Name' }).check(Schema.isMinLength(1)) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BrandSitsOverAStructOfRefinedFields',
      code: `import { Schema } from 'effect'
export const Box = Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) }).pipe(Schema.brand('Box'))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_StockSchemaStandsInANonDomainPosition',
      code: `import { Schema } from 'effect'
export const encodeName = Schema.encodeSync(Schema.String)`,
      filename: '/repo/pkg/src/codec.ts',
    },
    {
      name: 'Should_Pass_When_StructComesFromAForeignModule',
      code: `import { Schema } from './fake-schema.js'
export const User = Schema.Struct({ name: Schema.String })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_LocalAliasCarriesTheRefinement',
      code: `import { Schema } from 'effect'
const Name = Schema.String.check(Schema.isMinLength(1))
export const User = Schema.Struct({ name: Name })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OptionalWrapsARefinedString',
      code: `import { Schema } from 'effect'
export const User = Schema.Struct({ nick: Schema.optional(Schema.String.check(Schema.isMaxLength(20))) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_StringFieldCarriesPattern',
      code: `import { Schema } from 'effect'
export const User = Schema.Struct({ code: Schema.String.check(Schema.isPattern(/^[A-Z]+$/)) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AliasCycleCannotResolve',
      code: `import { Schema } from 'effect'
const A = B
const B = A
export const User = Schema.Struct({ name: A })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_StringFieldCarriesFilter',
      code: `import { Schema } from 'effect'
export const User = Schema.Struct({ name: Schema.String.pipe(Schema.filter((s: string) => s.length > 0)) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_FieldKeyIsComputed',
      code: `import { Schema } from 'effect'
const K = 'name'
export const User = Schema.Struct({ [K]: Schema.String })`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: [
    ...SCHEMA_BARE_PRIMITIVE_FIELD_INVALID,
  ],
})
