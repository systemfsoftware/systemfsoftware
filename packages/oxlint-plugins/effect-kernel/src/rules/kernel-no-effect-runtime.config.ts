import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BANNED_RUN_CALLS = {
  'Effect.runSync': 'synchronously runs the effect — a kernel only builds descriptions',
  'Effect.runPromise': 'runs the effect as a promise — a kernel only builds descriptions',
  'Effect.runFork': 'forks the effect into the runtime — a kernel only builds descriptions',
  'Effect.runCallback': 'runs the effect and calls back — a kernel only builds descriptions',
  'Effect.runSyncExit': 'synchronously runs the effect to an exit — a kernel only builds descriptions',
  'Effect.runPromiseExit': 'runs the effect to an exit promise — a kernel only builds descriptions',
  'Run.run': 'runs an effect through the run service — a kernel only builds descriptions',
  'Run.runSync': 'synchronously runs an effect through the run service — a kernel only builds descriptions',
  'Runtime.runSync': 'runs through a runtime — a kernel only builds descriptions',
  'Runtime.runPromise': 'runs through a runtime as a promise — a kernel only builds descriptions',
  'Runtime.runFork': 'forks through a runtime — a kernel only builds descriptions',
} as const

export const RUN_CALL_EXPECTED =
  'constructing an Effect description only — building an Effect is pure (KE1), running it is not' as const
export const RUN_CALL_FIX =
  'return the Effect description for the executor to run, or run it at the shell edge with a runtime' as const

export const EFFECT_RUN_CALL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban running an Effect in *.kernel.ts files. Constructing a description (Effect.gen, Effect.sync, pipe) is pure and allowed; executing it is I/O.',
  },
  schema: [Options],
  messages: {
    effectRunCall: EFFECT_RUN_CALL_MESSAGE,
  },
} as const
