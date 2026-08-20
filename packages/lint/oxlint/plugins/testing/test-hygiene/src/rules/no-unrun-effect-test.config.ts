export const RUNNER = /^(it|test)$/
export const EFFECT_MODULE_ALIAS = /^Effect/

export const EFFECT_CONSTRUCTOR: Record<string, true> = {
  all: true,
  either: true,
  fail: true,
  flatMap: true,
  gen: true,
  promise: true,
  succeed: true,
  sync: true,
  tryPromise: true,
}

export const UNRUN_EFFECT_TEST_MESSAGE = 'Expected: a test that executes its assertions. ' +
  'Actual: the callback returns an Effect to a bare `{{runner}}`, which vitest discards — the body never ' +
  'runs, so no assertion inside it can fail and the test passes for any implementation. ' +
  'Fix: use `{{runner}}.effect` (or `{{runner}}.scoped`) from @effect/vitest, or run the Effect with ' +
  '`await Effect.runPromise(...)` in an async callback.'

export const meta = {
  type: 'problem',
  docs: {
    description: 'Flag a test whose callback returns an Effect to a bare `it`/`test`. Vitest awaits a thenable; ' +
      'an Effect is a description, so the callback body never runs and every assertion inside it is skipped ' +
      'while the test reports green.',
  },
  schema: [],
  messages: {
    unrunEffectTest: UNRUN_EFFECT_TEST_MESSAGE,
  },
} as const
