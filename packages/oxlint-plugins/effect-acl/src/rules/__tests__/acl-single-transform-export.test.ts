import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { aclSingleTransformExport } from '../acl-single-transform-export.js'

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

const dataFor = (actual: string) => ({
  name: '*.acl.ts',
  expected: 'exactly one transform export — the ACL itself',
  actual,
  fix: 'move each additional crossing into its own *.acl.ts file',
})

const singleTransformAcl = `
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

const transformAlongsideSchemasAndTypes = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderRow = S.Struct({ orderId: S.String, title: S.String })
export const Order = S.Struct({ id: S.String, title: S.String })

export type OrderId = string
export interface OrderMeta { readonly createdAt: string }

export const OrderFromRow = S.transformOrFail(OrderRow, Order, {
  strict: true,
  decode: (row) => ParseResult.succeed({ id: row.orderId, title: row.title }),
  encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'Decode-only ACL')),
})
`

const nonAclFileWithManyTransforms = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const AFromX = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export const BFromY = S.transformOrFail(Y, B, { strict: true, decode: () => ParseResult.succeed(b), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'y')) })
`

const aclWithNoExports = `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

const helper = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`

ruleTester.run('acl-single-transform-export', aclSingleTransformExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleTransformOrFail_InAcl',
      code: singleTransformAcl,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_TransformAlongsideSourceAndTargetSchemasAndTypes_InAcl',
      code: transformAlongsideSchemasAndTypes,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_OnlyTypesAndSchemas_InAcl',
      code: `
import * as S from 'effect/Schema'

export const OrderRow = S.Struct({ orderId: S.String })
export type OrderId = string
export interface OrderMeta { readonly createdAt: string }
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_NonAclFile_HasManyTransforms',
      code: nonAclFileWithManyTransforms,
      filename: 'composite.handler.ts',
    },
    {
      name: 'Should_Pass_When_AclFileWithNoExports',
      code: aclWithNoExports,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SingleTransformViaSpecifierReExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { OrderFromRow }
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SingleTransformFunctionDeclarationViaSpecifier_InAcl',
      code: `
function OrderFromRow(row) { return { id: row.orderId } }
export { OrderFromRow }
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SingleTransformPlusTypeOnlyReExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export type { Foo } from './types.js'
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnlyStarReExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export type * from './types.js'
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_InlineTypeSpecifierReExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { type Foo } from './types.js'
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_InlineTypeSpecifierWithoutSource_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { type Foo }
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_SchemaDeclarationReExportedViaSpecifier_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

const OrderRow = S.Struct({ id: S.String, title: S.String })
export { OrderRow }

export const OrderFromRow = S.transformOrFail(OrderRow, Order, { strict: true, decode: () => ParseResult.succeed({ id: OrderRow.id }), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_MemberAccessSchemaDeclarationReExportedViaSpecifier_InAcl',
      code: `
import * as S from 'effect/Schema'

const OrderId = S.String
export { OrderId }
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_NonExportedClassInTopLevelDeclarations_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

class InternalRowMapper {}

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
    },
    {
      name: 'Should_Pass_When_DefaultExportIsNotAFunction_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export default 42
`,
      filename: 'order.acl.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TwoTransformExports',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export const OrderToColumns = S.transformOrFail(Order, OrderColumns, { strict: true, decode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'y')), encode: (order) => ParseResult.succeed({ id: order.id }) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('2 transform exports') }],
    },
    {
      name: 'Should_Report_ThreeTransformExports',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const AFromX = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export const BFromY = S.transformOrFail(Y, B, { strict: true, decode: () => ParseResult.succeed(b), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'y')) })
export const CFromZ = S.transformOrFail(Z, C, { strict: true, decode: () => ParseResult.succeed(c), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'z')) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('3 transform exports') }],
    },
    {
      name: 'Should_Report_TransformAndTransformWithS_Transform',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const AFromX = S.transform(X, A, { strict: true, decode: (x) => x, encode: (a) => a })
export const BFromY = S.transformOrFail(Y, B, { strict: true, decode: () => ParseResult.succeed(b), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'y')) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('2 transform exports') }],
    },
    {
      name: 'Should_Report_DirectExportPlusSpecifierExport_OfTransform',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

const AFromX = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
const BFromY = S.transformOrFail(Y, B, { strict: true, decode: () => ParseResult.succeed(b), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'y')) })
export const AFromXDirect = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { BFromY }
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('2 transform exports') }],
    },
    {
      name: 'Should_Report_FunctionDeclarationAndTransformExport',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export function helper() {}
export const AFromX = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('2 transform exports') }],
    },
    {
      name: 'Should_Report_LeakedNonTransformHelperExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export const Note = 'plain helper'
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'Note',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_ExportAllDeclaration_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export * from './other.js'
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'export *',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_CrossModuleSpecifierReExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { helper } from './helpers.js'
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'helper',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_BareTransformMemberAccessExport_InAcl',
      code: `
import * as S from 'effect/Schema'

export const NotATransform = S.transform
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'NotATransform',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_CrossModuleReExport_OfLocallyDeclaredSchema_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

const helper = S.Struct({ id: S.String })
export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
export { helper } from './helpers.js'
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'helper',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_NonSObjectMemberTransformCall_InAcl',
      code: `
import * as S from 'effect/Schema'

export const AFromX = Foo.S.transform(X, A, { strict: true, decode: (x) => x, encode: (a) => a })
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'AFromX',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_UninitializedVariableExport_InAcl',
      code: `
import * as S from 'effect/Schema'

let unused: string
export { unused }
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'unused',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_ClassExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export class RowMapper {}

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'RowMapper',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_EnumExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export enum Direction { Up, Down }

export const OrderFromRow = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'export',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_DefaultFunctionPlusTransformExport_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

export default function OrderFromRow(row) { return { id: row.orderId } }

export const AFromX = S.transformOrFail(X, A, { strict: true, decode: () => ParseResult.succeed(a), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'x')) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('2 transform exports') }],
    },
    {
      name: 'Should_Report_ComputedMemberAccessTransformCall_InAcl',
      code: `
import * as S from 'effect/Schema'

export const AFromX = S["transform"](X, A, { strict: true, decode: (x) => x, encode: (a) => a })
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'AFromX',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_NonSObjectTransformCall_InAcl',
      code: `
import * as S from 'effect/Schema'

export const AFromX = Foo.transform(X, A, { strict: true, decode: (x) => x, encode: (a) => a })
`,
      filename: 'order.acl.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'AFromX',
          expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
          actual: 'exported value',
          fix: 'move constants, helpers, and classes out of the ACL file',
        },
      }],
    },
    {
      name: 'Should_Report_TooManyFunctionSpecifierExports_InAcl',
      code: `
import * as S from 'effect/Schema'
import { ParseResult } from 'effect'

function AFromX(x) { return { id: x.id } }
function BFromY(y) { return { id: y.id } }
export { AFromX, BFromY }

export const CFromZ = S.transformOrFail(Z, C, { strict: true, decode: () => ParseResult.succeed(c), encode: (_, __, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'z')) })
`,
      filename: 'order.acl.ts',
      errors: [{ messageId: 'tooManyTransformExports', data: dataFor('3 transform exports') }],
    },
  ],
})
