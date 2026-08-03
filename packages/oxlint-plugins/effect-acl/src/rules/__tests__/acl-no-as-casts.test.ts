import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { aclNoAsCasts } from '../acl-no-as-casts.js'

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

const expected = 'a domain value produced by ParseResult.decode(DomainSchema)'
const fix =
  'hand the decoded object to ParseResult.decode(DomainSchema) so branding and refinements apply through the schema contract — never assert the brand'

const castData = (label: string) => ({
  name: 'an `as` cast',
  expected,
  actual: `an 'as ${label}' assertion`,
  fix,
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

ruleTester.run('acl-no-as-casts', aclNoAsCasts, {
  valid: [
    {
      name: 'Should_Pass_When_DecodingThroughParseResultDecode',
      code: decodeOnlyAcl,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_AnnotatingWithATypeInsteadOfCasting',
      code: `const order: Order = decodeOrder(row)`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_UsingSatisfiesInsteadOfCasting',
      code: `const order = { id: row.id, title: row.title } satisfies Order`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_UsingNonNullAssertion',
      code: `const id = row.orderId!`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_UsingGenericInstantiation',
      code: `const make = Either.right<Order>`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorFileCasts',
      code: `const order = row as any`,
      filename: 'place-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_StoreFileCasts',
      code: `const order = row as Order`,
      filename: 'place-order.store.ts',
    },
    {
      name: 'Should_Pass_When_ShapeFileCasts',
      code: `const order = row as unknown as Order`,
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Pass_When_CastTextAppearsInComment',
      code: `// the decode below must not cast row as Order`,
      filename: 'place-order.acl.ts',
    },
    {
      name: 'Should_Pass_When_CastTextAppearsInString',
      code: `const note = 'row as Order'`,
      filename: 'place-order.acl.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_CastingToAny',
      code: `const id = row.id as any`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('TSAnyKeyword') }],
    },
    {
      name: 'Should_Report_When_CastingToUnknown',
      code: `const id = row.id as unknown`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('TSUnknownKeyword') }],
    },
    {
      name: 'Should_Report_When_CastingToDomainType',
      code: `const order = row as Order`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('Order') }],
    },
    {
      name: 'Should_Report_When_CastingToQualifiedDomainType',
      code: `const order = row as Billing.Order`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('Order') }],
    },
    {
      name: 'Should_Report_When_CastingToUnionType',
      code: `const x = row as Order | Invoice`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('TSUnionType') }],
    },
    {
      name: 'Should_Report_When_CastingToLiteralType',
      code: `const status = raw as 'draft'`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('TSLiteralType') }],
    },
    {
      name: 'Should_Report_When_CastingToPrimitiveKeyword',
      code: `const id = raw as string`,
      filename: 'place-order.acl.ts',
      errors: [{ messageId: 'asCast', data: castData('TSStringKeyword') }],
    },
    {
      name: 'Should_Report_When_ChainedDoubleAssertion',
      code: `const order = row as unknown as Order`,
      filename: 'place-order.acl.ts',
      errors: [
        { messageId: 'asCast', data: castData('Order') },
        { messageId: 'asCast', data: castData('TSUnknownKeyword') },
      ],
    },
    {
      name: 'Should_Report_EachCast_When_FileHasMultipleCasts',
      code: `const a = row as any\nconst b = row as Order`,
      filename: 'place-order.acl.ts',
      errors: [
        { messageId: 'asCast', data: castData('TSAnyKeyword') },
        { messageId: 'asCast', data: castData('Order') },
      ],
    },
  ],
})
