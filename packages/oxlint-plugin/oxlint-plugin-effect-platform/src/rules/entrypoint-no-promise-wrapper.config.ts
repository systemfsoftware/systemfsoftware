import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ENTRYPOINT_FILE = /(?:^|[\\/])main\.ts$/u

export const RUN_MAIN = 'runMain' as const

export const PROMISE_CONSTRUCTORS: ReadonlySet<string> = new Set([
  'Effect.promise',
  'Effect.tryPromise',
])

export const PROMISE_WRAPPER_EXPECTED = 'the program itself handed to runMain' as const
export const PROMISE_WRAPPER_ACTUAL = 'a foreign promise wrapped in an Effect and handed to runMain' as const
export const PROMISE_WRAPPER_FIX =
  'the awaited framework starts its own fibers, so runMain interrupts nothing and runs none of their finalizers - either let the framework own the loop and drop runMain, or build the program as one Effect and interpret that' as const

export const PROMISE_WRAPPER_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban runMain wrapping a bare Effect.promise or Effect.tryPromise in main.ts. The outer edge only awaits a promise: the fibers doing the work belong to a runtime inside it, beyond reach of the interrupt handling and teardown runMain exists to provide.',
  },
  schema: [Options],
  messages: {
    promiseWrapper: PROMISE_WRAPPER_MESSAGE,
  },
} as const
