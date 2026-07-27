import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ESCAPING_CONSTRUCTORS = ['Map', 'Set', 'WeakMap', 'WeakSet'] as const

export const DESTRUCTURED_BINDING_NAME = '<destructured>' as const

export const EXPECTED_BINDING = 'an executor stateless across invocations' as const

export const BINDING_FIX =
  'extract a *.state.ts cell behind a domain-typed surface and receive it as a dependency' as const

export const MUTABLE_MODULE_BINDING_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MODULE_LEVEL_COLLECTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban module-level state in *.executor.ts files. Executors must be stateless across invocations; operation-local state stays inline, but state that outlives one call belongs in a *.state.ts cell received as a dependency.',
  },
  schema: [Options],
  messages: {
    mutableModuleBinding: MUTABLE_MODULE_BINDING_MESSAGE,
    moduleLevelCollection: MODULE_LEVEL_COLLECTION_MESSAGE,
  },
} as const
