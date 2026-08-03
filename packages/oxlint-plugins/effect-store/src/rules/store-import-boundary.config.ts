import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const STORE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXECUTOR_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const HANDLER_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MIDDLEWARE_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ADAPTER_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const STORE_IMPORT_EXPECTED = 'one store per aggregate — the transaction monopoly is per-aggregate' as const

export const STORE_IMPORT_ACTUAL = 'a reference to another .store cell' as const

export const STORE_IMPORT_FIX =
  'route the second aggregate through its own executor; cross-aggregate atomicity travels by events, never by a multi-store transaction' as const

export const EXECUTOR_IMPORT_EXPECTED = 'the store to receive decisions as arguments, never to reach upward' as const

export const EXECUTOR_IMPORT_ACTUAL = 'a reference to the .executor cell' as const

export const EXECUTOR_IMPORT_FIX =
  'the executor calls the store, never the reverse — receive the decision as an argument' as const

export const HANDLER_IMPORT_EXPECTED = 'transport to call the executor, never the persistence leaf' as const

export const HANDLER_IMPORT_ACTUAL = 'a reference to the .handler cell' as const

export const HANDLER_IMPORT_FIX =
  'drop the transport dependency — the store sits below the handler and never imports it' as const

export const MIDDLEWARE_IMPORT_EXPECTED = 'transport edges to stay above the persistence leaf' as const

export const MIDDLEWARE_IMPORT_ACTUAL = 'a reference to the .middleware cell' as const

export const MIDDLEWARE_IMPORT_FIX =
  'drop the transport dependency — a store persists, it does not attach transport facts' as const

export const ADAPTER_IMPORT_EXPECTED = 'the DB port injected as a Context.Tag, never the concrete driver' as const

export const ADAPTER_IMPORT_ACTUAL = 'a reference to the .adapter cell' as const

export const ADAPTER_IMPORT_FIX =
  'yield* the injected DB tag — the adapter is wired at the composition root and imported nowhere in domain cells' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Enforce the import boundary in *.store.ts: never another store, never the executor, handler, middleware, or adapter. The store persists one aggregate through its ACL and the injected DB port.',
  },
  schema: [Options],
  messages: {
    storeImport: STORE_IMPORT_MESSAGE,
    executorImport: EXECUTOR_IMPORT_MESSAGE,
    handlerImport: HANDLER_IMPORT_MESSAGE,
    middlewareImport: MIDDLEWARE_IMPORT_MESSAGE,
    adapterImport: ADAPTER_IMPORT_MESSAGE,
  },
} as const
