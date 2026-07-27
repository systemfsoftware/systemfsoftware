import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorImportBoundary } from '../executor-import-boundary.js'

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

ruleTester.run('executor-import-boundary', executorImportBoundary, {
  valid: [
    {
      name: 'Should_Allow_AdapterTypeOnlyDeclaration_When_ExecutorFile',
      code: `import type { PaymentGateway } from './payment-gateway.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_AdapterAllTypeSpecifiers_When_ExecutorFile',
      code: `import { type A, type B } from './x.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_WorkflowImport_When_ExecutorFile',
      code: `import { confirmOrder } from './confirm-order.workflow.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_AclImport_When_ExecutorFile',
      code: `import { decodeOrder } from './order.acl.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_StoreImport_When_ExecutorFile',
      code: `import { saveOrder } from './order.store.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_EffectImport_When_ExecutorFile',
      code: `import { Effect } from 'effect'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_StateImport_When_ExecutorFile',
      code: `import { lock } from './dedupe.state.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_SchemaImport_When_ExecutorFile',
      code: `import { OrderId } from './order.schema.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_AdaptersNearMiss_When_ExecutorFile',
      code: `import { adapters } from './adapters.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ShapeNearMiss_When_ExecutorFile',
      code: `import { shaped } from './shape.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_AdapterValueImport_When_HandlerFile',
      code: `import { makePaymentAdapter } from './payment-gateway.adapter.js'\n`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Allow_DynamicStoreImport_When_ExecutorFile',
      code: `const m = yield* Effect.promise(() => import('./order.store.js'))\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_DynamicNonLiteralImport_When_ExecutorFile',
      code: `const name = 'order.store'\nconst m = yield* Effect.promise(() => import(name))\n`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_AdapterValueImport_When_ExecutorFile',
      code: `import { makePaymentAdapter } from './payment-gateway.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './payment-gateway.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_BareAdapterImport_When_ExecutorFile',
      code: `import './stripe.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './stripe.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterMixedImportTypeFirst_When_ExecutorFile',
      code: `import { type A, makeB } from './x.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './x.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterMixedImportValueFirst_When_ExecutorFile',
      code: `import { A, type B } from './x.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './x.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterDefaultImport_When_ExecutorFile',
      code: `import PGateway from './payment.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './payment.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_AdapterNamespaceImport_When_ExecutorFile',
      code: `import * as Pay from './payment.adapter.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './payment.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShapeTypeOnlyImport_When_ExecutorFile',
      code: `import type { OrderRow } from './order.shape.ts'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'shapeImport',
          data: {
            name: './order.shape.ts',
            expected: 'domain vocabulary only',
            actual: 'an import of the .shape cell',
            fix: 'go through the *.acl.ts — the ACL is the only licensed foreign-to-domain hop',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ShapeValueImport_When_ExecutorFile',
      code: `import { OrderRow } from './order.shape.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'shapeImport',
          data: {
            name: './order.shape.js',
            expected: 'domain vocabulary only',
            actual: 'an import of the .shape cell',
            fix: 'go through the *.acl.ts — the ACL is the only licensed foreign-to-domain hop',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExecutorValueImport_When_ExecutorFile',
      code: `import { RefundExecutor } from './refund.executor.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'executorImport',
          data: {
            name: './refund.executor.js',
            expected: 'one operation per executor',
            actual: 'an import of the .executor cell',
            fix: 'give the composite operation its own executor whose sandwich reads what both decisions need',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExecutorTypeOnlyImport_When_ExecutorFile',
      code: `import type { X } from './refund.executor.js'\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'executorImport',
          data: {
            name: './refund.executor.js',
            expected: 'one operation per executor',
            actual: 'an import of the .executor cell',
            fix: 'give the composite operation its own executor whose sandwich reads what both decisions need',
          },
        },
      ],
    },
    {
      name: 'Should_Report_DynamicAdapterImport_When_ExecutorFile',
      code: `const m = yield* Effect.promise(() => import('./payment.adapter.js'))\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'adapterValueImport',
          data: {
            name: './payment.adapter.js',
            expected: 'type-only imports of adapter modules',
            actual: 'a value import of the .adapter cell',
            fix:
              "use `import type` and borrow the method type with Provider['Type']['method']; bind the adapter at the composition root",
          },
        },
      ],
    },
    {
      name: 'Should_Report_DynamicShapeImport_When_ExecutorFile',
      code: `const m = yield* Effect.promise(() => import('./order.shape.js'))\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'shapeImport',
          data: {
            name: './order.shape.js',
            expected: 'domain vocabulary only',
            actual: 'an import of the .shape cell',
            fix: 'go through the *.acl.ts — the ACL is the only licensed foreign-to-domain hop',
          },
        },
      ],
    },
    {
      name: 'Should_Report_DynamicExecutorImport_When_ExecutorFile',
      code: `const m = yield* Effect.promise(() => import('./refund.executor.js'))\n`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'executorImport',
          data: {
            name: './refund.executor.js',
            expected: 'one operation per executor',
            actual: 'an import of the .executor cell',
            fix: 'give the composite operation its own executor whose sandwich reads what both decisions need',
          },
        },
      ],
    },
  ],
})
