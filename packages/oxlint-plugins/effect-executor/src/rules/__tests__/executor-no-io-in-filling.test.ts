import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorNoIoInFilling } from '../executor-no-io-in-filling.js'

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

const WORKFLOW_IMPORT = `import { confirmOrder } from './confirm-order.workflow.js'`
const STORE_IMPORT = `import { findOrderRow } from './order.store.js'`
const ADAPTER_IMPORT = `import { capture } from './payment.adapter.js'`

const error = (actual: string) =>
  ({
    messageId: 'ioInWorkflowArgument',
    data: {
      name: 'confirmOrder',
      expected: 'a workflow call whose arguments are names bound above it',
      actual,
      fix: 'hoist the read above the workflow call, bind it to a name, and pass that name into the command',
    },
  }) as const

const SUSPENSION = 'a suspended effect inside the workflow call'
const IO_CALL = 'an I/O call inside the workflow call'

ruleTester.run('executor-no-io-in-filling', executorNoIoInFilling, {
  valid: [
    {
      name: 'Should_Allow_HoistedRead_When_WorkflowTakesBoundName',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
function* run() {
  const row = yield* findOrderRow(id)
  return yield* confirmOrder(new ConfirmOrderCommand({ row }))
}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_YieldOnTheWorkflowCallItself_When_ArgumentsArePure',
      code: `${WORKFLOW_IMPORT}
function* run() {
  return yield* confirmOrder(cmd)
}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_PureHelperInArguments_When_HelperIsNotIo',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
const decision = confirmOrder(new ConfirmOrderCommand({ total: computeTotal(items) }))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_StoreCall_When_NotInsideWorkflowArguments',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
const row = findOrderRow(id)
const decision = confirmOrder(cmd)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_YieldInsideStoreCall_When_NoWorkflowImported',
      code: `${STORE_IMPORT}
function* run() {
  return findOrderRow(yield* id)
}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_AclCallInArguments_When_AclIsNotAnIoCell',
      code: `${WORKFLOW_IMPORT}
import { decodeOrder } from './order.acl.js'
const decision = confirmOrder(new ConfirmOrderCommand({ order: decodeOrder(row) }))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_UnimportedCallInArguments_When_RootIsUnknown',
      code: `${WORKFLOW_IMPORT}
const decision = confirmOrder(new ConfirmOrderCommand({ order: loadSomething(row) }))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_LiteralArgument_When_RootIsNotIdentifier',
      code: `${WORKFLOW_IMPORT}
const decision = confirmOrder({ id: 'abc' }.id)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_IoArgument_When_CalleeIsNotIdentifierRooted',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
const decision = (() => confirmOrder)()(findOrderRow(id))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_YieldInWorkflowArguments_When_HandlerFile',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
function* run() {
  return confirmOrder(new ConfirmOrderCommand({ row: yield* findOrderRow(id) }))
}`,
      filename: 'confirm-order.handler.ts',
    },
    {
      name: 'Should_Allow_NonWorkflowCallWithIoArgument_When_CalleeIsNotAWorkflow',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
const audited = recordAudit(findOrderRow(id))`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_YieldInArguments_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
function* run() {
  return confirmOrder(new ConfirmOrderCommand({ row: yield* findOrderRow(id) }))
}`,
      filename: 'confirm-order.executor.ts',
      errors: [error(SUSPENSION)],
    },
    {
      name: 'Should_Report_AwaitInArguments_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
async function run() {
  return confirmOrder(new ConfirmOrderCommand({ row: await loadRow(id) }))
}`,
      filename: 'confirm-order.executor.ts',
      errors: [error(SUSPENSION)],
    },
    {
      name: 'Should_Report_StoreCallInArguments_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
const decision = confirmOrder(new ConfirmOrderCommand({ row: findOrderRow(id) }))`,
      filename: 'confirm-order.executor.ts',
      errors: [error(IO_CALL)],
    },
    {
      name: 'Should_Report_AdapterCallInArguments_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
${ADAPTER_IMPORT}
const decision = confirmOrder(new ConfirmOrderCommand({ captured: capture(total, token) }))`,
      filename: 'confirm-order.executor.ts',
      errors: [error(IO_CALL)],
    },
    {
      name: 'Should_Report_NamespaceStoreCallInArguments_When_ExecutorFile',
      code: `${WORKFLOW_IMPORT}
import * as Store from './order.store.js'
const decision = confirmOrder(new ConfirmOrderCommand({ row: Store.findOrderRow(id) }))`,
      filename: 'confirm-order.executor.ts',
      errors: [error(IO_CALL)],
    },
    {
      name: 'Should_Report_Once_When_TwoIoCallsInArguments',
      code: `${WORKFLOW_IMPORT}
${STORE_IMPORT}
${ADAPTER_IMPORT}
const decision = confirmOrder(new ConfirmOrderCommand({ row: findOrderRow(id), captured: capture(t) }))`,
      filename: 'confirm-order.executor.ts',
      errors: [error(IO_CALL)],
    },
    {
      name: 'Should_Report_IoCall_When_WorkflowCalleeIsNamespaced',
      code: `import * as Workflow from './confirm-order.workflow.js'
${STORE_IMPORT}
const decision = Workflow.confirmOrder(new ConfirmOrderCommand({ row: findOrderRow(id) }))`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'ioInWorkflowArgument',
          data: {
            name: 'Workflow',
            expected: 'a workflow call whose arguments are names bound above it',
            actual: IO_CALL,
            fix: 'hoist the read above the workflow call, bind it to a name, and pass that name into the command',
          },
        },
      ],
    },
  ],
})
