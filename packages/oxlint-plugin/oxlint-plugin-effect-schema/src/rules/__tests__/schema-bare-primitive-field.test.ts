import { createRuleTester } from './_tester.js'

import { BARE_ACTUAL, BARE_EXPECTED, BARE_FIX } from '../schema-bare-primitive-field.config.js'
import { schemaBarePrimitiveField } from '../schema-bare-primitive-field.js'

const ruleTester = createRuleTester()

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

const bareError = (field: string, member: string) => ({
  messageId: 'barePrimitiveField' as const,
  data: {
    name: `a bare-primitive domain field '${field}' (${member})`,
    expected: BARE_EXPECTED,
    actual: BARE_ACTUAL,
    fix: BARE_FIX,
  },
})

/**
 * The shared known-bad corpus for the bare-primitive rule: every entry names a
 * Struct field whose chain bottoms out at a bare primitive with no refinement.
 * A later firing suite imports this by name; entries stay in sync with the
 * suite by construction.
 */
export const SCHEMA_BARE_PRIMITIVE_FIELD_INVALID = [
  {
    name: 'Should_Fail_When_DomainFieldHoldsBareString',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ email: Schema.String })`,
    filename: SCHEMA_FILE,
    errors: [bareError('email', 'String')],
  },
  {
    name: 'Should_Fail_When_AliasedFieldHoldsBareNumber',
    code: `import { Schema as S } from 'effect'
export const Counter = S.Struct({ count: S.Number })`,
    filename: SCHEMA_FILE,
    errors: [bareError('count', 'Number')],
  },
  {
    name: 'Should_Fail_When_NamespacedFieldHoldsBareBoolean',
    code: `import * as E from 'effect'
export const Flags = E.Schema.Struct({ enabled: E.Schema.Boolean })`,
    filename: SCHEMA_FILE,
    errors: [bareError('enabled', 'Boolean')],
  },
  {
    name: 'Should_Fail_When_DomainFieldHoldsUnrefinedUnknown',
    code: `import { Schema } from 'effect'
export const Bag = Schema.Struct({ misc: Schema.Unknown })`,
    filename: SCHEMA_FILE,
    errors: [bareError('misc', 'Unknown')],
  },
  {
    name: 'Should_FailOncePerField_When_SeveralFieldsAreBare',
    code: `import { Schema } from 'effect'
export const Pair = Schema.Struct({ a: Schema.String, b: Schema.Number })`,
    filename: SCHEMA_FILE,
    errors: [bareError('a', 'String'), bareError('b', 'Number')],
  },
  {
    name: 'Should_Fail_When_BrandSitsOnBareStringWithNoFilter',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ email: Schema.String.pipe(Schema.brand('Email')) })`,
    filename: SCHEMA_FILE,
    errors: [bareError('email', 'String')],
  },
  {
    name: 'Should_Fail_When_AnnotationIsTheOnlyChainStep',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ name: Schema.String.annotate({ identifier: 'Name' }) })`,
    filename: SCHEMA_FILE,
    errors: [bareError('name', 'String')],
  },
  {
    name: 'Should_Fail_When_LocalAliasHoldsBareString',
    code: `import { Schema } from 'effect'
const Name = Schema.String
export const User = Schema.Struct({ name: Name })`,
    filename: SCHEMA_FILE,
    errors: [bareError('name', 'String')],
  },
  {
    name: 'Should_Fail_When_OptionalWrapsBareString',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ nick: Schema.optional(Schema.String) })`,
    filename: SCHEMA_FILE,
    errors: [bareError('nick', 'String')],
  },
  {
    name: 'Should_Fail_When_NullOrWrapsBareString',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ nick: Schema.NullOr(Schema.String) })`,
    filename: SCHEMA_FILE,
    errors: [bareError('nick', 'String')],
  },
  {
    name: 'Should_Fail_When_PipeFunctionHoldsBrandOverBare',
    code: `import { pipe, Schema } from 'effect'
export const User = Schema.Struct({ email: pipe(Schema.String, Schema.brand('Email')) })`,
    filename: SCHEMA_FILE,
    errors: [bareError('email', 'String')],
  },
  {
    name: 'Should_Fail_When_BareFieldLivesOutsideASchemaFile',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ email: Schema.String })`,
    filename: '/repo/pkg/src/domain.ts',
    errors: [bareError('email', 'String')],
  },
  {
    name: 'Should_Fail_When_BareStringHidesBehindAsCast',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ name: Schema.String as Schema.Schema<string> })`,
    filename: SCHEMA_FILE,
    errors: [bareError('name', 'String')],
  },
  {
    name: 'Should_Fail_When_BareFieldKeyIsQuoted',
    code: `import { Schema } from 'effect'
export const User = Schema.Struct({ 'email': Schema.String })`,
    filename: SCHEMA_FILE,
    errors: [bareError('email', 'String')],
  },
]

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
