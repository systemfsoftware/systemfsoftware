import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const RAW_PRIMITIVE_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.state.ts must never export a raw coordination primitive (Map, Set, Ref, Deferred, Semaphore, TRef). The state cell exposes a domain-typed surface — withLock, joinInFlight, ask, tell — that hides the mutable interior.',
  },
  schema: [Options],
  messages: {
    rawPrimitiveExport: RAW_PRIMITIVE_EXPORT_MESSAGE,
  },
} as const
