import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { aclTransformOrfailRequired } from '../acl-transform-orfail-required.js'

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

const dataFor = (name: string) => ({
  name,
  expected:
    'at least one schema transform decoding a foreign shape into a branded domain type — v3 S.transformOrFail(From, To, …) or v4 From.pipe(S.decodeTo(S.toType(To), { decode: SchemaGetter.transformOrFail(…) }))',
  actual:
    'no schema transform — no S.transformOrFail call and no S.decodeTo with a SchemaGetter.transformOrFail / SchemaTransformation.transformOrFail getter',
  fix:
    'declare the crossing as S.transformOrFail(SourceSchema, DomainSchema, { strict: true, decode, encode }) with the inactive direction returning ParseResult.Forbidden — or, in effect v4, SourceSchema.pipe(S.decodeTo(S.toType(DomainSchema), { decode: SchemaGetter.transformOrFail(…), encode: SchemaGetter.forbidden(…) })) — or rename the file if it is not an ACL',
})

const decodeOnlyAcl = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'
import { OrderRow } from './order.shape.js'
import { Order } from './order.schema.js'

export const OrderFromRow = S.transformOrFail(OrderRow, Order, {
  strict: true,
  decode: (row) => ParseResult.decode(Order)({ ...row, id: row.orderId }),
  encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Decode-only ACL')),
})
`

const encodeOnlyAcl = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'
import { OrderColumns } from './order.shape.js'
import { Order } from './order.schema.js'

export const OrderToColumns = S.transformOrFail(Order, OrderColumns, {
  strict: true,
  decode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Upsert-only ACL')),
  encode: (order) => ParseResult.succeed({ id: order.id, title: order.title }),
})
`

const bothDirectionsAcl = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'
import { OrderRow, OrderColumns } from './order.shape.js'
import { Order } from './order.schema.js'

export const OrderFromRow = S.transformOrFail(OrderRow, Order, {
  strict: true,
  decode: (row) => ParseResult.decode(Order)({ ...row, id: row.orderId }),
  encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Decode-only ACL')),
})

export const OrderToColumns = S.transformOrFail(Order, OrderColumns, {
  strict: true,
  decode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Upsert-only ACL')),
  encode: (order) => ParseResult.succeed({ id: order.id, title: order.title }),
})
`

ruleTester.run('acl-transform-orfail-required', aclTransformOrfailRequired, {
  valid: [
    {
      name: 'Should_Pass_When_DecodeOnlyTransformOrFailIsDeclared',
      code: decodeOnlyAcl,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_EncodeOnlyTransformOrFailIsDeclared',
      code: encodeOnlyAcl,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_TwoTransformsCoverBothDirections',
      code: bothDirectionsAcl,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_TransformOrFailAppearsInsideAFunctionBody',
      code: `
const toOrder = () =>
  S.transformOrFail(OrderRow, Order, {
    strict: true,
    decode: (row) => ParseResult.decode(Order)({ id: row.id }),
    encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Decode-only ACL')),
  })
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_V4DecodeToWithGetterTransformOrFailIsDeclared',
      code: `
import * as S from 'effect/Schema'
import { SchemaGetter, Effect } from 'effect'

export const OrderFromText = S.String.pipe(
  S.decodeTo(S.toType(Order), {
    decode: SchemaGetter.transformOrFail((raw) => Effect.succeed({ id: raw })),
    encode: SchemaGetter.forbidden(() => 'OrderFromText is decode-only'),
  }),
)
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_V4SchemaTransformationTransformOrFailIsDeclared',
      code: `
import * as S from 'effect/Schema'
import { SchemaTransformation, Effect } from 'effect'

export const OrderFromText = S.String.pipe(
  S.decodeTo(S.toType(Order), SchemaTransformation.transformOrFail({
    decode: (raw) => Effect.succeed({ id: raw }),
    encode: () => Effect.succeed('raw'),
  })),
)
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_V4TransformOrFailAppearsInsideAFunctionBody',
      code: `
const toOrder = () =>
  S.String.pipe(
    S.decodeTo(S.toType(Order), {
      decode: SchemaGetter.transformOrFail((raw) => ({ id: raw })),
      encode: SchemaGetter.forbidden(() => 'Decode-only ACL'),
    }),
  )
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_V4GetterTransformOrFailIsPiped',
      code: `
import * as S from 'effect/Schema'
import { SchemaGetter, Effect } from 'effect'

export const OrderFromText = S.String.pipe(
  S.decodeTo(S.toType(Order), {
    decode: SchemaGetter.transformOrFail((raw) => Effect.succeed({ id: raw })).pipe(
      SchemaGetter.checkEffect((order) => Effect.succeed(true)),
    ),
    encode: SchemaGetter.forbidden(() => 'OrderFromText is decode-only'),
  }),
)
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_V4TransformationIsBuiltViaSchemaTransformationMake',
      code: `
import * as S from 'effect/Schema'
import { SchemaGetter, SchemaTransformation, Effect } from 'effect'

export const OrderFromText = S.String.pipe(
  S.decodeTo(S.toType(Order), SchemaTransformation.make({
    decode: SchemaGetter.transformOrFail((raw) => Effect.succeed({ id: raw })),
    encode: SchemaGetter.forbidden(() => 'OrderFromText is decode-only'),
  })),
)
`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorFileLacksTransformOrFail',
      code: `export const run = (cmd: unknown) => cmd`,
      filename: 'place-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_StoreFileLacksTransformOrFail',
      code: `export const load = (id: string) => id`,
      filename: 'place-order.store.ts',
    },
    {
      name: 'Should_Pass_When_ShapeFileLacksTransformOrFail',
      code: `export const orderRow = { id: '', title: '' }`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_EmptyKernelFile',
      code: ``,
      filename: 'money.kernel.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_FileHasNoTransformOrFail',
      code: `export const orderFromRow = (row: OrderRow): Order => ({ id: row.orderId })`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_OnlySchemaTransformIsUsed',
      code: `
import * as S from 'effect/Schema'
export const fromRow = S.transform(OrderRow, Order, { decode: (r) => r, encode: (d) => d })
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_OnlyPlainDecodeToIsUsed',
      code: `
import * as S from 'effect/Schema'
export const fromRow = S.String.pipe(S.decodeTo(S.toType(Order)))
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_DecodeToUsesTotalTransformationOnly',
      code: `
import * as S from 'effect/Schema'
import { SchemaTransformation } from 'effect'
export const fromRow = S.String.pipe(S.decodeTo(S.toType(Order), SchemaTransformation.transform({
  decode: (raw) => ({ id: raw }),
  encode: (order) => order.id,
})))
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_DecodeToGetterObjectHasNoTransformOrFail',
      code: `
import * as S from 'effect/Schema'
import { SchemaGetter } from 'effect'
export const fromRow = S.String.pipe(S.decodeTo(S.toType(Order), {
  decode: SchemaGetter.passthrough(),
  encode: SchemaGetter.passthrough(),
}))
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_AliasedSchemaGetterIsUsed',
      code: `
import * as S from 'effect/Schema'
import { SchemaGetter as Getter, Effect } from 'effect'
export const fromRow = S.String.pipe(S.decodeTo(S.toType(Order), {
  decode: Getter.transformOrFail((raw) => Effect.succeed({ id: raw })),
  encode: Getter.forbidden(() => 'Decode-only ACL'),
}))
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_OnlyParseResultDecodeIsUsed',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'
export const fromRow = (row: OrderRow) => ParseResult.decode(Order)(row)
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_AliasedSchemaNamespaceIsUsed',
      code: `
import * as Schema from 'effect/Schema'
import { ParseResult } from 'effect'
export const fromRow = Schema.transformOrFail(OrderRow, Order, {
  strict: true,
  decode: (row) => ParseResult.decode(Order)(row),
  encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Decode-only ACL')),
})
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_TransformOrFailIsOnlyReferenced',
      code: `
import * as S from 'effect/Schema'
const transform = S.transformOrFail
`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_TransformOrFailIsComputedMemberAccess',
      code: `
import * as S from 'effect/Schema'
export const fromRow = S['transformOrFail'](OrderRow, Order, { strict: true, decode, encode })
      `,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_CommentMentionsTransformOrFail',
      code: `// S.transformOrFail(OrderRow, Order, { strict: true, decode, encode })`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
    {
      name: 'Should_Report_When_AclFileIsEmpty',
      code: ``,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'transformOrFailRequired', data: dataFor('place-order.acl.ts') }],
    },
  ],
})
