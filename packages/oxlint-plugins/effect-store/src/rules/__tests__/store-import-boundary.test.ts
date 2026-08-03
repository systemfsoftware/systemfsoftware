import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeImportBoundary } from '../store-import-boundary.js'

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

const boundaryError = (
  messageId: 'storeImport' | 'executorImport' | 'handlerImport' | 'middlewareImport' | 'adapterImport',
  name: string,
  expected: string,
  actual: string,
  fix: string,
) => ({
  messageId,
  data: { name, expected, actual, fix },
})

ruleTester.run('store-import-boundary', storeImportBoundary, {
  valid: [
    {
      name: 'Should_Allow_AclImport_When_StoreFile',
      code: `import { decodeOrder } from './order.acl.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_ShapeImport_When_StoreFile',
      code: `import { orders } from './order.shape.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_SchemaImport_When_StoreFile',
      code: `import { OrderId } from './order.schema.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_WorkflowImport_When_StoreFile',
      code: `import type { OrderDecision } from './order.workflow.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_StateImport_When_StoreFile',
      code: `import { lock } from './dedupe.state.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_KernelImport_When_StoreFile',
      code: `import { chunk } from './chunk.kernel.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_EffectImport_When_StoreFile',
      code: `import * as Effect from 'effect/Effect'\nimport { Schema as S } from 'effect/Schema'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_HyphenatedNearMiss_When_StoreFile',
      code: `import { saveOrder } from './order-store.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_BareStoreWord_When_StoreFile',
      code: `import { saveOrder } from './store.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_AdapterLike_When_StoreFile',
      code: `import { adapters } from './adapters.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_PortModule_When_StoreFile',
      code: `import { DB } from './db.port.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_NonCellModule_When_StoreFile',
      code: `import { findOrderRow } from './repo.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Allow_Local_Export_Specifier_When_StoreFile',
      code: `const findOrder = 1\nexport { findOrder }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_StoreImport_When_File_Is_Not_A_Store',
      code: `import { saveOrder } from './order.store.js'\n`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_StoreImport_When_File_Is_A_Handler',
      code: `import { findOrder } from './order.store.js'\n`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Allow_DynamicNonLiteralImport_When_StoreFile',
      code: `const name = 'order.store'\nconst m = yield* Effect.promise(() => import(name))\n`,
      filename: 'order.store.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_StoreImport_When_StoreFile',
      code: `import { saveOrder } from './order.store.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.js',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_StoreTypeOnlyImport_When_StoreFile',
      code: `import type { OrderStore } from './order.store.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.js',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_ExecutorImport_When_StoreFile',
      code: `import { confirmOrder } from './confirm-order.executor.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'executorImport',
          './confirm-order.executor.js',
          'the store to receive decisions as arguments, never to reach upward',
          'a reference to the .executor cell',
          'the executor calls the store, never the reverse — receive the decision as an argument',
        ),
      ],
    },
    {
      name: 'Should_Report_HandlerImport_When_StoreFile',
      code: `import { onRequest } from './order.handler.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'handlerImport',
          './order.handler.js',
          'transport to call the executor, never the persistence leaf',
          'a reference to the .handler cell',
          'drop the transport dependency — the store sits below the handler and never imports it',
        ),
      ],
    },
    {
      name: 'Should_Report_MiddlewareImport_When_StoreFile',
      code: `import { requireAuth } from './auth.middleware.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'middlewareImport',
          './auth.middleware.js',
          'transport edges to stay above the persistence leaf',
          'a reference to the .middleware cell',
          'drop the transport dependency — a store persists, it does not attach transport facts',
        ),
      ],
    },
    {
      name: 'Should_Report_AdapterImport_When_StoreFile',
      code: `import { DrizzleLive } from './drizzle.adapter.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'adapterImport',
          './drizzle.adapter.js',
          'the DB port injected as a Context.Tag, never the concrete driver',
          'a reference to the .adapter cell',
          'yield* the injected DB tag — the adapter is wired at the composition root and imported nowhere in domain cells',
        ),
      ],
    },
    {
      name: 'Should_Report_AdapterTypeOnlyImport_When_StoreFile',
      code: `import type { Drizzle } from './drizzle.adapter.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'adapterImport',
          './drizzle.adapter.js',
          'the DB port injected as a Context.Tag, never the concrete driver',
          'a reference to the .adapter cell',
          'yield* the injected DB tag — the adapter is wired at the composition root and imported nowhere in domain cells',
        ),
      ],
    },
    {
      name: 'Should_Report_DynamicStoreImport_When_StoreFile',
      code: `const m = yield* Effect.promise(() => import('./order.store.js'))\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.js',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_Reexport_When_StoreFile',
      code: `export { saveOrder } from './order.store.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.js',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_ExportAll_When_StoreFile',
      code: `export * from './order.store.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.js',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_StoreImport_When_Ts_Source_Is_Used',
      code: `import { saveOrder } from './order.store.ts'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'storeImport',
          './order.store.ts',
          'one store per aggregate — the transaction monopoly is per-aggregate',
          'a reference to another .store cell',
          'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction',
        ),
      ],
    },
    {
      name: 'Should_Report_AdapterImport_When_StoreFile_Uses_Subpath',
      code: `import { DrizzleLive } from './adapters/drizzle.adapter.js'\n`,
      filename: 'order.store.ts',
      errors: [
        boundaryError(
          'adapterImport',
          './adapters/drizzle.adapter.js',
          'the DB port injected as a Context.Tag, never the concrete driver',
          'a reference to the .adapter cell',
          'yield* the injected DB tag — the adapter is wired at the composition root and imported nowhere in domain cells',
        ),
      ],
    },
  ],
})
