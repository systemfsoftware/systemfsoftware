import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ESCAPING_CONSTRUCTORS = ['Map', 'Set', 'WeakMap', 'WeakSet'] as const

export const DESTRUCTURED_BINDING_NAME = '<destructured>' as const

export const EXPECTED_BINDING = 'a store stateless across invocations' as const

export const BINDING_FIX =
  'keep the persistence leaf stateless — move caches and registries to a *.state.ts cell received as a dependency' as const

export const MUTABLE_MODULE_BINDING_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MODULE_LEVEL_COLLECTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban module-level state in *.store.ts files. Stores must be stateless across invocations; a store with a cache is two cells — keep the store a leaf and move the cache to a state cell.',
  },
  schema: [Options],
  messages: {
    mutableModuleBinding: MUTABLE_MODULE_BINDING_MESSAGE,
    moduleLevelCollection: MODULE_LEVEL_COLLECTION_MESSAGE,
  },
} as const
