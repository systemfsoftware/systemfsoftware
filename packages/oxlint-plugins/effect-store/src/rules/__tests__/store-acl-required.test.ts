import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeAclRequired } from '../store-acl-required.js'

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

const ACL_IMPORT = `import { decodeOrder } from './order.acl.js'`

const missingAclError = {
  messageId: 'missingAclImport',
  data: {
    name: 'order.store.ts',
    expected: "a value import of the aggregate's *.acl.ts",
    actual: 'no value import from the aggregate *.acl.ts',
    fix:
      'import the ACL and pipe every read through S.decode(SelectACL) and every write through S.encode(UpsertACL) — never return raw rows and never cast',
  },
}

ruleTester.run('store-acl-required', storeAclRequired, {
  valid: [
    {
      name: 'Should_Pass_When_Store_Imports_Its_Acl',
      code:
        `${ACL_IMPORT}\nexport const findOrder = Effect.fn(function* (id: OrderId) { return yield* Effect.succeed(id) })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Acl_Imported_From_Ts_Source',
      code: `import { decodeOrder } from './order.acl.ts'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Acl_Imported_From_A_Deeper_Path',
      code: `import { decodeOrder } from '../acl/order.acl.ts'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Acl_Imported_Alongside_Other_Imports',
      code:
        `import * as Effect from 'effect/Effect'\nimport { Schema as S } from 'effect/Schema'\nimport { orders } from './order.shape.js'\nimport { decodeOrder } from './order.acl.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Namespace_Acl_Import_Is_Value',
      code: `import * as Acl from './order.acl.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_SideEffect_Acl_Import_Is_Present',
      code: `import './order.acl.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Mixed_Type_And_Value_Specifiers_From_Acl',
      code: `import { type OrderRow, decodeOrder } from './order.acl.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_Missing_Acl_When_File_Is_Not_A_Store',
      code: `export const handler = (req: Request) => req\n`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Ignore_Missing_Acl_When_File_Is_An_Executor',
      code: `import { saveOrder } from './order.store.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_Acl_File_Itself_Has_No_Acl_Import',
      code: `export const decodeOrder = (row: OrderRow) => row\n`,
      filename: 'order.acl.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_MissingAcl_When_Store_Imports_No_Acl',
      code:
        `import * as Effect from 'effect/Effect'\nexport const findOrder = Effect.fn(function* (id: OrderId) { return yield* Effect.succeed(id) })\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Store_Is_Empty',
      code: '',
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Only_Type_Import_From_Acl',
      code: `import type { OrderRow } from './order.acl.js'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Only_Type_Specifiers_From_Acl',
      code: `import { type A, type B } from './order.acl.js'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Hyphenated_NearMiss_Is_Imported',
      code: `import { decodeOrder } from './order-acl.ts'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Bare_Acl_Module_Is_Imported',
      code: `import { decodeOrder } from './acl.ts'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Another_Store_Is_Imported',
      code: `import { findOrderRow } from './order.store.js'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
    {
      name: 'Should_Report_MissingAcl_When_Driver_Package_Is_Imported',
      code: `import { drizzle } from 'drizzle-orm/node-postgres'\n`,
      filename: 'order.store.ts',
      errors: [missingAclError],
    },
  ],
})
