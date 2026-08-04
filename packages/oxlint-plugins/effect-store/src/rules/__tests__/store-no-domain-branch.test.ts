import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeNoDomainBranch } from '../store-no-domain-branch.js'

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

const branchError = (actual: string) => ({
  messageId: 'branchOnInputState',
  data: {
    name: '_tag',
    expected: 'data-integrity existence checks only — domain branches live in the workflow',
    actual,
    fix: 'move the branch into the *.workflow.ts — the store receives already-decided data and persists it',
  },
})

const matchError = {
  messageId: 'matchOnInputState',
  data: {
    name: 'Match.value',
    expected: 'the store to persist, never to dispatch on decoded state',
    actual: 'exhaustive dispatch over a decoded value',
    fix: 'let the workflow dispatch on the decoded value and persist the decision it returns',
  },
}

ruleTester.run('store-no-domain-branch', storeNoDomainBranch, {
  valid: [
    {
      name: 'Should_Pass_When_Existence_Check_On_Branded_Optional',
      code: `const row = yield* findOrder(id)
if (row === undefined) return Effect.fail(new OrderStoreError({ reason: 'missing' }))
return row\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Null_Check_On_Branded_Optional',
      code: `const existing = yield* findOrder(id)
if (existing !== null) return existing\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Conflict_Guard_Checks_Existence',
      code: `const existing = yield* findOrder(id)
if (existing !== undefined) return existing\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Branch_Does_Not_Read_Tag',
      code: `if (order.total < 0) { return order }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Branch_Reads_A_Non_Tag_Property',
      code: `if (order.status === 'paid') { return order }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Match_Over_A_Local_Non_Acl_Value',
      code: `const maybe = Option.some(1)
const out = Match.value(maybe).pipe(Match.tag('Some', () => 1), Match.tag('None', () => 0))\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Tag_Read_Is_Not_In_A_Branch_Position',
      code: `const tag = row._tag
return tag\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Match_Callee_Is_Not_Match',
      code: `const out = object.value(1)\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Match_Property_Is_Computed',
      code: `const out = Match['value'](1)\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Const_Init_Is_A_Literal',
      code: `const limit = 5\nreturn limit\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Store_File_Has_No_Branches',
      code: `import * as Effect from 'effect/Effect'
export const touch = Effect.fn(function* () { return yield* Effect.void })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_Tag_Branches_When_File_Is_Not_A_Store',
      code: `if (decision._tag === 'Cancelled') { return 1 }\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_Tag_Branches_When_File_Is_A_Workflow',
      code: `if (decision._tag === 'Cancelled') { return 1 }\n`,
      filename: 'confirm-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonMatch_Callee_Operates_On_An_Acl_Value',
      code: `import { decodeOrder } from './order.acl.js'
const out = result.value(decodeOrder(row))\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_NonValue_Match_Method_Operates_On_An_Acl_Value',
      code: `import { decodeOrder } from './order.acl.js'
const out = Match.tag(decodeOrder(row), 'Some', () => 1)\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Match_Operand_Is_Derived_From_A_Non_Acl_Import',
      code: `import { order } from './order.shape.js'
const out = Match.value(order)\n`,
      filename: 'order.store.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Branch_When_If_Reads_Tag_On_A_Parameter',
      code: `if (decision._tag === 'Cancelled') { return 1 }\n`,
      filename: 'order.store.ts',
      errors: [branchError('a branch on a domain-typed _tag')],
    },
    {
      name: 'Should_Report_Branch_When_If_Reads_Computed_Tag',
      code: `if (order['_tag'] === 'Open') { return 1 }\n`,
      filename: 'order.store.ts',
      errors: [branchError('a branch on a domain-typed _tag')],
    },
    {
      name: 'Should_Report_Branch_When_Ternary_Reads_Tag',
      code: `const out = order._tag === 'Open' ? 1 : 2\n`,
      filename: 'order.store.ts',
      errors: [branchError('a branch on a domain-typed _tag')],
    },
    {
      name: 'Should_Report_Branch_When_Switch_Reads_Tag',
      code: `switch (row._tag) { case 'Open': return 1 }\n`,
      filename: 'order.store.ts',
      errors: [branchError('a branch on a domain-typed _tag')],
    },
    {
      name: 'Should_Report_Branch_When_If_Reads_Tag_On_Acl_Derived_Value',
      code: `import { decodeOrder } from './order.acl.js'
const order = decodeOrder(row)
if (order._tag === 'Ready') { return 1 }\n`,
      filename: 'order.store.ts',
      errors: [branchError('a branch on a domain-typed _tag')],
    },
    {
      name: 'Should_Report_Match_When_Operand_Is_An_Acl_Import',
      code: `import { decodeOrder } from './order.acl.js'
const out = Match.value(decodeOrder(row))\n`,
      filename: 'order.store.ts',
      errors: [matchError],
    },
    {
      name: 'Should_Report_Match_When_Operand_Is_A_Tainted_Const',
      code: `import { decodeOrder } from './order.acl.js'
const order = decodeOrder(row)
const out = Match.value(order)\n`,
      filename: 'order.store.ts',
      errors: [matchError],
    },
    {
      name: 'Should_Report_Match_When_Operand_Is_A_Namespace_Acl_Call',
      code: `import * as Acl from './order.acl.js'
const out = Match.value(Acl.decodeOrder(row))\n`,
      filename: 'order.store.ts',
      errors: [matchError],
    },
    {
      name: 'Should_Report_Match_When_Operand_Is_A_Chained_Acl_Call',
      code: `import { decodeOrder } from './order.acl.js'
const out = Match.value(decodeOrder(row).value)\n`,
      filename: 'order.store.ts',
      errors: [matchError],
    },
    {
      name: 'Should_Report_Match_When_Operand_Is_Awaited_Acl_Call',
      code: `import { decodeOrder } from './order.acl.js'
export const load = Effect.fn(function* () {
  return Match.value(yield* decodeOrder(row))
})\n`,
      filename: 'order.store.ts',
      errors: [matchError],
    },
  ],
})
