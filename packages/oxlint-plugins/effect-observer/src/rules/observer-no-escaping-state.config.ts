import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MUTABLE_CONTAINERS: readonly string[] = ['Map', 'Set', 'WeakMap', 'WeakSet']

export const ESCAPING_STATE_EXPECTED = 'state built fresh per operation' as const
export const MODULE_LEVEL_LET_FIX =
  'move the binding inside the operation so each call starts clean, or derive it as a const per call' as const
export const MUTABLE_MODULE_CONSTANT_FIX =
  'build it inside the operation, or wrap it in Object.freeze if it is genuinely static data' as const

export const MODULE_LEVEL_LET_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const MUTABLE_MODULE_CONSTANT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban module-level mutable state in *.observer.ts files. Harness state must be built fresh per operation and die with the call; a module-level registry, cache, counter, or mutable container leaks between tests and makes suites order-dependent.',
  },
  schema: [Options],
  messages: {
    moduleLevelLet: MODULE_LEVEL_LET_MESSAGE,
    mutableModuleConstant: MUTABLE_MODULE_CONSTANT_MESSAGE,
  },
} as const
