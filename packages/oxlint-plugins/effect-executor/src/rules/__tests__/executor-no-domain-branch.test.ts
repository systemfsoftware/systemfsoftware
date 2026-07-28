import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorNoDomainBranch } from '../executor-no-domain-branch.js'

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
const STORE_IMPORT = `import { findOrderRow } from './order.store.js'`
const WORKFLOW_IMPORT = `import { confirmOrder } from './confirm-order.workflow.js'`

const MATCH_ERROR = {
  messageId: 'matchOnInputState',
  data: {
    name: 'Match.value',
    expected: 'the shell to translate a decision, never to reach one',
    actual: 'exhaustive dispatch over a decoded input',
    fix: 'pass the decoded value into the *.workflow.ts as a command field and dispatch on the decision it returns',
  },
} as const

const branchError = (actual: string) =>
  ({
    messageId: 'branchOnInputState',
    data: {
      name: '_tag',
      expected: 'branching on domain state only inside the workflow',
      actual,
      fix:
        'pass the decoded value into the *.workflow.ts and let it dispatch exhaustively; the executor translates the decision it returns',
    },
  }) as const

ruleTester.run('executor-no-domain-branch', executorNoDomainBranch, {
  valid: [
    {
      name: 'Should_Allow_MatchOverWorkflowDecision_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
const decision = confirmOrder(cmd)
const out = Match.value(decision)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_MatchOverUntrackedValue_When_NoInputImports',
      code: `const out = Match.value(anything)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_MatchTagArm_When_OperandIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match.tag('Shipped', handler)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_MatchTypeWithoutOperand_When_ExecutorFile',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match.type()`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NearMissNamespace_When_OperandIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Matcher.value(order)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NearMissMethod_When_OperandIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match.values(order)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedMatchAccess_When_OperandIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match['value'](order)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ExistenceCheck_When_ValueIsDecoded',
      code: `${STORE_IMPORT}
const row = findOrderRow(id)
if (Option.isNone(row)) { fail() }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NonTagFieldBranch_When_ValueIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order.status === 'shipped') { fail() }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TagBranch_When_ValueIsNotDecoded',
      code: `${ACL_IMPORT}
if (result._tag === 'Left') { fail() }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TagRead_When_OutsideAnyBranch',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const tag = order._tag`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TagBranch_When_ValueComesFromWorkflow',
      code: `${WORKFLOW_IMPORT}
const decision = confirmOrder(cmd)
if (decision._tag === 'Confirmed') { emit() }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_SwitchWithoutTag_When_ValueIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
switch (order.kind) { default: break }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_MatchOverDestructuredBinding_When_IdIsNotIdentifier',
      code: `${ACL_IMPORT}
const { state } = decodeOrder(row)
const out = Match.value(state)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NestedNamespaceMatch_When_OperandIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = ns.Match.value(order)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedTagAccessByIdentifier_When_ValueIsDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order[_tag] === 'Shipped') { fail() }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_Match_When_DecodeIsWrappedInArrayLiteral',
      code: `${ACL_IMPORT}
const orders = [decodeOrder(row)]
const out = Match.value(orders)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_MatchOverDecodedValue_When_HandlerFile',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match.value(order)`,
      filename: 'confirm-order.handler.ts',
    },
    {
      name: 'Should_Ignore_TagBranch_When_WorkflowFile',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order._tag === 'Shipped') { fail() }`,
      filename: 'confirm-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Match_When_OperandIsAclDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const out = Match.value(order)`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_OperandIsStoreRead',
      code: `${STORE_IMPORT}
const row = findOrderRow(id)
const out = Match.value(row)`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_OperandCallsAclDirectly',
      code: `${ACL_IMPORT}
const out = Match.value(decodeOrder(row))`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_OperandIsNamespaceAclCall',
      code: `import * as Acl from './order.acl.js'
const out = Match.value(Acl.decodeOrder(row))`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_OperandIsDefaultStoreImport',
      code: `import store from './order.store.js'
const row = store.find(id)
const out = Match.value(row)`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_DecodeIsAwaited',
      code: `${ACL_IMPORT}
async function run() {
  const order = await decodeOrder(row)
  return Match.value(order)
}`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_DecodeIsYielded',
      code: `${ACL_IMPORT}
function* run() {
  const order = yield* decodeOrder(row)
  return Match.value(order)
}`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_DecodeIsNonNullAsserted',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)!
const out = Match.value(order)`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_Match_When_OperandIsTransitivelyDecoded',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const state = order.state
const out = Match.value(state)`,
      filename: 'confirm-order.executor.ts',
      errors: [MATCH_ERROR],
    },
    {
      name: 'Should_Report_IfBranch_When_TestReadsDecodedTag',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order._tag === 'Shipped') { fail() }`,
      filename: 'confirm-order.executor.ts',
      errors: [branchError('an if branching on a decoded input tag')],
    },
    {
      name: 'Should_Report_IfBranch_When_TagReadIsComputedStringLiteral',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order['_tag'] === 'Shipped') { fail() }`,
      filename: 'confirm-order.executor.ts',
      errors: [branchError('an if branching on a decoded input tag')],
    },
    {
      name: 'Should_Report_IfBranch_When_TagReadIsNestedInLogical',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
if (order._tag === 'Shipped' && ready) { fail() }`,
      filename: 'confirm-order.executor.ts',
      errors: [branchError('an if branching on a decoded input tag')],
    },
    {
      name: 'Should_Report_Ternary_When_TestReadsDecodedTag',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
const x = order._tag === 'Shipped' ? a : b`,
      filename: 'confirm-order.executor.ts',
      errors: [branchError('a ternary branching on a decoded input tag')],
    },
    {
      name: 'Should_Report_Switch_When_DiscriminantReadsDecodedTag',
      code: `${ACL_IMPORT}
const order = decodeOrder(row)
switch (order._tag) { default: break }`,
      filename: 'confirm-order.executor.ts',
      errors: [branchError('a switch branching on a decoded input tag')],
    },
  ],
})
