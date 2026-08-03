import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const NON_FN_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const FN_EXPORT_EXPECTED =
  'an exported Effect.fn-wrapped function — one per query or mutation, named for what it does' as const

export const FN_EXPORT_FIX =
  'wrap the query or mutation in Effect.fn(function* (...) {...}) so the store stays a module of named Effect.fn functions' as const

export const ACTUAL_FUNCTION = 'an exported function not wrapped in Effect.fn' as const

export const ACTUAL_EFFECT_VALUE = 'an exported Effect value not built with Effect.fn' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.store.ts is a module of named Effect.fn functions: every exported function-shaped binding must be wrapped in Effect.fn, and an exported Effect value must be built with Effect.fn rather than Effect.gen.',
  },
  schema: [Options],
  messages: {
    nonFnExport: NON_FN_EXPORT_MESSAGE,
  },
} as const
