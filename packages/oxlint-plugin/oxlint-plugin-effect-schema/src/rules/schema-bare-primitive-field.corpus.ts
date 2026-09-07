import { BARE_ACTUAL, BARE_EXPECTED, BARE_FIX } from './schema-bare-primitive-field.config.js'

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
