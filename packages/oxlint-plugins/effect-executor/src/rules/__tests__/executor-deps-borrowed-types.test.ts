import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorDepsBorrowedTypes } from '../executor-deps-borrowed-types.js'

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

ruleTester.run('executor-deps-borrowed-types', executorDepsBorrowedTypes, {
  valid: [
    {
      name: 'Should_Allow_BorrowedIndexedAccess_When_ExecutorFile',
      code: `
import { Context } from 'effect'
import type { PaymentGateway } from './payment-gateway.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: PaymentGateway['Type']['capture'] }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_MultipleIndexedAccessMembers_When_ExecutorFile',
      code: `
import { Context } from 'effect'
import type { PaymentGateway } from './payment-gateway.adapter.js'
import type { Clock } from './clock.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  {
    readonly capture: PaymentGateway['Type']['capture']
    readonly now: Clock['Type']['now']
  }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_PlainTypeReferenceMember_When_ExecutorFile',
      code: `
import { Context } from 'effect'
import type { Clock } from './clock.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly clock: Clock }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_PrimitiveMember_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly retries: number }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EmptyShape_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  {}
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedKeyWithFunctionType_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { [key]: (a: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NoTypeArguments_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps') {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TypeArgumentsWithoutTypeLiteral_When_ExecutorFile',
      code: `
import { Context } from 'effect'
import type { Clock } from './clock.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  Clock
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NotContextTagExtension_When_ExecutorFile',
      code: `
import { Something } from './something.js'

export class ConfirmOrderExecutorDeps extends Something('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedContextTagAccess_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context['Tag']('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextsObjectNearMiss_When_ExecutorFile',
      code: `
const Contexts = { Tag: (n: string) => n }
export class ConfirmOrderExecutorDeps extends Contexts.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ContextReferenceExtension_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Reference('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_SchemaTagExtension_When_ExecutorFile',
      code: `
import { Schema as S } from 'effect'

export class ConfirmOrderExecutorDeps extends S.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ClassWithoutExtends_When_ExecutorFile',
      code: `
export class ConfirmOrderExecutorDeps {
  readonly capture: (amount: number, token: string) => void = () => undefined
}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_StaySilent_When_HandWrittenSignatureInHandlerFile',
      code: `
import { Context } from 'effect'

export class OrderHandlerDeps extends Context.Tag('OrderHandlerDeps')<
  OrderHandlerDeps,
  { readonly capture: (amount: number, token: string) => void }
>() {}
`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Allow_UncurriedSuperClassCall_When_ExecutorFile',
      code: `
class Foo<Ident, Shape> {
  readonly capture: Shape = undefined as never
}

export class ConfirmOrderExecutorDeps extends Foo<ConfirmOrderExecutorDeps, { readonly capture: (amount: number) => void }>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedTagMemberAccess_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context['Tag']('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NestedNamespaceContextTag_When_ExecutorFile',
      code: `
import * as ns from 'effect'

export class ConfirmOrderExecutorDeps extends ns.Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_IndexSignatureMember_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { [key: string]: (amount: number) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ComputedMethodSignature_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { [CAPTURE](amount: number): void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SingleHandWrittenFunctionProperty_When_ExecutorFile',
      code: `
import { Context, Effect } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { readonly capture: (amount: number, token: string) => Effect.Effect<Capture> }
>() {}
`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'capture',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for capture',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
      ],
    },
    {
      name: 'Should_Report_OnlyHandWrittenMember_When_ShapeMixesBorrowedAndHandWritten',
      code: `
import { Context, Effect } from 'effect'
import type { PaymentGateway } from './payment-gateway.adapter.js'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  {
    readonly capture: PaymentGateway['Type']['capture']
    readonly refund: (amount: number) => Effect.Effect<void>
  }
>() {}
`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'refund',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for refund',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
      ],
    },
    {
      name: 'Should_Report_TwoHandWrittenMembers_When_ExecutorFile',
      code: `
import { Context, Effect } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  {
    readonly capture: (amount: number, token: string) => Effect.Effect<Capture>
    readonly refund: (amount: number) => Effect.Effect<void>
  }
>() {}
`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'capture',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for capture',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'refund',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for refund',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
      ],
    },
    {
      name: 'Should_Report_MethodSignatureShorthand_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { capture(amount: number): void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'capture',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for capture',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
      ],
    },
    {
      name: 'Should_Report_StringLiteralKeyName_When_ExecutorFile',
      code: `
import { Context } from 'effect'

export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<
  ConfirmOrderExecutorDeps,
  { 'capture-payment': (a: number) => void }
>() {}
`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'handWrittenMethodSignature',
          data: {
            name: 'capture-payment',
            expected: "the provider's type borrowed with Provider['Type']['method']",
            actual: 'a hand-written signature for capture-payment',
            fix: "import type the provider and borrow the method type: Provider['Type']['<method>']",
          },
        },
      ],
    },
  ],
})
