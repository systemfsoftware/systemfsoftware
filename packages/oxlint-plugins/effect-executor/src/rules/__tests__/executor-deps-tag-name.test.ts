import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorDepsTagName } from '../executor-deps-tag-name.js'

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

ruleTester.run('executor-deps-tag-name', executorDepsTagName, {
  valid: [
    {
      name: 'Should_Allow_CanonicalDepsTag_When_ExecutorFile',
      code: `import { Context, Effect } from 'effect'
import type { PaymentGateway } from './payment-gateway.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_DeterministicKeyIdentifier_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag(
  '@acme/orders/confirm-order.executor/ConfirmOrderExecutorDeps',
)<
  ConfirmOrderExecutorDeps,
  { readonly capture: () => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_DeterministicKeyIdentifier_When_InternalExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag(
  '@acme/orders/internal/confirm-order.executor/ConfirmOrderExecutorDeps',
)<
  ConfirmOrderExecutorDeps,
  { readonly capture: () => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_RefundPaymentDepsTag_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class RefundPaymentExecutorDeps extends Context.Tag('RefundPaymentExecutorDeps')<
  RefundPaymentExecutorDeps,
  { readonly refund: (amount: number) => Effect.Effect<void> }
>() {}`,
      filename: 'refund-payment.executor.ts',
    },
    {
      name: 'Should_Allow_SingleWordFile_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class SubmitExecutorDeps extends Context.Tag('SubmitExecutorDeps')<
  SubmitExecutorDeps,
  { readonly submit: () => Effect.Effect<void> }
>() {}`,
      filename: 'submit.executor.ts',
    },
    {
      name: 'Should_Allow_UnderscoreFile_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly confirm: () => Effect.Effect<void> }
>() {}`,
      filename: 'confirm_order.executor.ts',
    },
    {
      name: 'Should_Allow_ClassWithoutSuperClass_When_ExecutorFile',
      code: `export class Plain {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ClassExtendingPlainIdentifier_When_ExecutorFile',
      code: `import { Base } from './base'

export class ConfirmOrderExecutorDeps extends Base {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectService_When_ExecutorFile',
      code: `import { Effect } from 'effect'

export class ConfirmOrderExecutorDeps extends Effect.Service('ConfirmOrderExecutorDeps')() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextTagsPlural_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tags('ConfirmOrderExecutorDeps')() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextsObjectIdentifier_When_ExecutorFile',
      code: `import { Contexts } from './contexts'

export class ConfirmOrderExecutorDeps extends Contexts.Tag('ConfirmOrderExecutorDeps')() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedTagAccess_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context['Tag']('ConfirmOrderExecutorDeps')() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NonLiteralTagArgument_When_ExecutorFile',
      code: `import { Context } from 'effect'

const name = 'ConfirmOrderExecutorDeps'
export class ConfirmOrderExecutorDeps extends Context.Tag(name)<
  ConfirmOrderExecutorDeps,
  {}
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_MisnamedTag_When_NonExecutorFile',
      code: `import { Context } from 'effect'

export class PaymentGateway extends Context.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly charge: (amount: number) => Effect.Effect<void> }
>() {}`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Ignore_MisnamedTagInWorkflow_When_NonExecutorFile',
      code: `import { Context } from 'effect'

export class PaymentGateway extends Context.Tag('PaymentGateway')<
  PaymentGateway,
  {}
>() {}`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Allow_BareTagIdentifierCallee_When_ExecutorFile',
      code: `export class PaymentGateway extends Tag('PaymentGateway')<
  PaymentGateway,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedTagMemberAccess_When_ExecutorFile',
      code: `export class PaymentGateway extends Context['Tag']('PaymentGateway')<
  PaymentGateway,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NestedObjectOnTagCallee_When_ExecutorFile',
      code: `export class PaymentGateway extends ns.Context.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextsNamespaceOnTagCallee_When_ExecutorFile',
      code: `export class PaymentGateway extends Contexts.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextTagsPropertyOnTagCallee_When_ExecutorFile',
      code: `export class PaymentGateway extends Context.Tags('PaymentGateway')<
  PaymentGateway,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ProviderNamedTag_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class PaymentGateway extends Context.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly charge: (amount: number) => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'providerNamedTag',
          data: {
            name: 'PaymentGateway',
            expected: 'the consumer-owned Tag ConfirmOrderExecutorDeps',
            actual: 'a Tag named PaymentGateway',
            fix: 'rename the Tag after the executor that consumes it, never after the provider',
          },
        },
      ],
    },
    {
      name: 'Should_Report_TagIdentifierMismatch_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('confirm-order')<
  ConfirmOrderExecutorDeps,
  { readonly charge: (amount: number) => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'tagIdentifierMismatch',
          data: {
            name: 'confirm-order',
            expected:
              'the identifier to equal the class name ConfirmOrderExecutorDeps, or a deterministic key ending in /ConfirmOrderExecutorDeps',
            actual: "identifier 'confirm-order' on class ConfirmOrderExecutorDeps",
            fix: 'make the Context.Tag identifier string the class name, or the deterministic key that ends in it',
          },
        },
      ],
    },
    {
      name: 'Should_Report_BothMisnamedAndMismatch_When_ExecutorFile',
      code: `import { Context } from 'effect'

export class PaymentGateway extends Context.Tag('confirm-order')<
  PaymentGateway,
  { readonly charge: (amount: number) => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'providerNamedTag',
          data: {
            name: 'PaymentGateway',
            expected: 'the consumer-owned Tag ConfirmOrderExecutorDeps',
            actual: 'a Tag named PaymentGateway',
            fix: 'rename the Tag after the executor that consumes it, never after the provider',
          },
        },
        {
          messageId: 'tagIdentifierMismatch',
          data: {
            name: 'confirm-order',
            expected:
              'the identifier to equal the class name PaymentGateway, or a deterministic key ending in /PaymentGateway',
            actual: "identifier 'confirm-order' on class PaymentGateway",
            fix: 'make the Context.Tag identifier string the class name, or the deterministic key that ends in it',
          },
        },
      ],
    },
    {
      name: 'Should_Report_SecondTag_When_MultipleDepsTagsInFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: () => Effect.Effect<void> }
>() {}

export class PaymentGateway extends Context.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly charge: () => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'providerNamedTag',
          data: {
            name: 'PaymentGateway',
            expected: 'the consumer-owned Tag ConfirmOrderExecutorDeps',
            actual: 'a Tag named PaymentGateway',
            fix: 'rename the Tag after the executor that consumes it, never after the provider',
          },
        },
        {
          messageId: 'multipleDepsTags',
          data: {
            name: 'PaymentGateway',
            expected: 'exactly one <Executor>Deps Tag per executor',
            actual: '2 dependency Tags in one executor',
            fix: 'split the operation into two executors, or merge the Tags into one <Executor>Deps',
          },
        },
      ],
    },
    {
      name: 'Should_Report_SecondAndThirdTag_When_ThreeDepsTagsInFile',
      code: `import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: () => Effect.Effect<void> }
>() {}

export class PaymentGateway extends Context.Tag('PaymentGateway')<
  PaymentGateway,
  { readonly charge: () => Effect.Effect<void> }
>() {}

export class ShippingGateway extends Context.Tag('ShippingGateway')<
  ShippingGateway,
  { readonly ship: () => Effect.Effect<void> }
>() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'providerNamedTag',
          data: {
            name: 'PaymentGateway',
            expected: 'the consumer-owned Tag ConfirmOrderExecutorDeps',
            actual: 'a Tag named PaymentGateway',
            fix: 'rename the Tag after the executor that consumes it, never after the provider',
          },
        },
        {
          messageId: 'multipleDepsTags',
          data: {
            name: 'PaymentGateway',
            expected: 'exactly one <Executor>Deps Tag per executor',
            actual: '3 dependency Tags in one executor',
            fix: 'split the operation into two executors, or merge the Tags into one <Executor>Deps',
          },
        },
        {
          messageId: 'providerNamedTag',
          data: {
            name: 'ShippingGateway',
            expected: 'the consumer-owned Tag ConfirmOrderExecutorDeps',
            actual: 'a Tag named ShippingGateway',
            fix: 'rename the Tag after the executor that consumes it, never after the provider',
          },
        },
        {
          messageId: 'multipleDepsTags',
          data: {
            name: 'ShippingGateway',
            expected: 'exactly one <Executor>Deps Tag per executor',
            actual: '3 dependency Tags in one executor',
            fix: 'split the operation into two executors, or merge the Tags into one <Executor>Deps',
          },
        },
      ],
    },
  ],
})
