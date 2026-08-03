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
  expected: 'at least one S.transformOrFail call decoding a foreign shape into a branded domain type',
  actual: 'no S.transformOrFail call',
  fix:
    'declare the crossing as S.transformOrFail(SourceSchema, DomainSchema, { strict: true, decode, encode }) with the inactive direction returning ParseResult.Forbidden — or rename the file if it is not an ACL',
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
