import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorOwnsContextTag } from '../executor-owns-context-tag.js'

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

const tagOutsideExecutorError = (
  form: string,
  cell: string,
  extras?: Partial<{ actual: string }>,
) => ({
  messageId: 'tagOutsideExecutor' as const,
  data: {
    name: form,
    expected: 'dependency Tags declared only in *.executor.ts',
    actual: extras?.actual ?? `a ${form} declared in the .${cell} cell`,
    fix: 'move the Tag into the executor that consumes it and name it <Executor>Deps',
  },
})

const code = (snippet: string): string => `import { Context, Effect } from 'effect'\n${snippet}`

ruleTester.run('executor-owns-context-tag', executorOwnsContextTag, {
  valid: [
    {
      name: 'Should_Allow_ContextTag_When_ExecutorFile',
      code: code(
        `export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<ConfirmOrderExecutorDeps, { readonly capture: PaymentGateway['Type']['capture'] }>() {}`,
      ),
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedTagAccess_When_WorkflowFile',
      code: code(`const Deps = Context['Tag']('Deps')<Deps, Deps>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_NestedNamespaceTag_When_WorkflowFile',
      code: code(`const Deps = ns.Context.Tag('Deps')<Deps, Deps>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_ContextTag_When_AdapterFile',
      code: code(`const Database = Context.Tag('Database')<Database, Database>()`),
      filename: 'payment.adapter.ts',
    },
    {
      name: 'Should_Allow_ContextTag_When_StateFile',
      code: code(`const Lock = Context.Tag('Lock')<Lock, Lock>()`),
      filename: 'lock.state.ts',
    },
    {
      name: 'Should_Allow_ContextTag_When_MiddlewareFile',
      code: code(`const Auth = Effect.Tag('Auth')<Auth, Auth>()`),
      filename: 'auth.middleware.ts',
    },
    {
      name: 'Should_Allow_ContextTag_When_ShapeFile',
      code: code(`const Raw = Context.Tag('Raw')<Raw, Raw>()`),
      filename: 'order.shape.ts',
    },
    {
      name: 'Should_Allow_ContextTag_When_PlainFile',
      code: code(`const Raw = Context.Tag('Raw')<Raw, Raw>()`),
      filename: 'plain.ts',
    },
    {
      name: 'Should_Allow_BareTag_When_WorkflowFile',
      code: code(`const x = Tag('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_ContextsTagObject_When_WorkflowFile',
      code: code(`const x = Contexts.Tag('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_ContextTagsProperty_When_WorkflowFile',
      code: code(`const x = Context.Tags('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_EffectTaggedProperty_When_WorkflowFile',
      code: code(`const x = Effect.Tagged('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_EffectGenericTag_When_WorkflowFile',
      code: code(`const x = Effect.GenericTag('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_ComputedTagAccess_When_WorkflowFile',
      code: code(`const x = Context['Tag']('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_TypeReference_When_WorkflowFile',
      code: code(`type Tag = Context.Tag<string, string>`),
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ContextTag_When_WorkflowFile',
      code: code(`const x = Context.Tag('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
      errors: [tagOutsideExecutorError('Context.Tag', 'workflow')],
    },
    {
      name: 'Should_Report_ContextTag_When_HandlerFile',
      code: code(
        `export class CancelOrderExecutorDeps extends Context.Tag('CancelOrderExecutorDeps')<CancelOrderExecutorDeps, {}>() {}`,
      ),
      filename: 'cancel-order.handler.ts',
      errors: [tagOutsideExecutorError('Context.Tag', 'handler')],
    },
    {
      name: 'Should_Report_ContextTag_When_StoreFile',
      code: code(`const x = Context.Tag('x')<x, {}>()`),
      filename: 'order.store.ts',
      errors: [tagOutsideExecutorError('Context.Tag', 'store')],
    },
    {
      name: 'Should_Report_ContextTag_When_AclFile',
      code: code(`const x = Context.Tag('x')<x, {}>()`),
      filename: 'order.acl.ts',
      errors: [tagOutsideExecutorError('Context.Tag', 'acl')],
    },
    {
      name: 'Should_Report_ContextGenericTag_When_WorkflowFile',
      code: code(`const x = Context.GenericTag('x')<x, {}>()`),
      filename: 'cancel-order.workflow.ts',
      errors: [tagOutsideExecutorError('Context.GenericTag', 'workflow')],
    },
    {
      name: 'Should_Report_EffectTag_When_StoreFile',
      code: code(`const x = Effect.Tag('x')<x, {}>()`),
      filename: 'order.store.ts',
      errors: [tagOutsideExecutorError('Effect.Tag', 'store')],
    },
    {
      name: 'Should_Report_CurriedClassExtendsContextTag_When_WorkflowFile',
      code: code(`class X extends Context.Tag('X')<X, {}>() {}`),
      filename: 'cancel-order.workflow.ts',
      errors: [tagOutsideExecutorError('Context.Tag', 'workflow')],
    },
  ],
})
