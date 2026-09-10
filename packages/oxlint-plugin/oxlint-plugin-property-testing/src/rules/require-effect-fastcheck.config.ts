export const FAST_CHECK_PACKAGE = 'fast-check' as const

export const EFFECT_FASTCHECK_SOURCES: Record<string, true> = {
  effect: true,
  'effect/testing': true,
}

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  description:
    'FastCheck is gone from property tests — no FastCheck value import under src/. Imports from the fast-check package and FastCheck re-exports from effect or effect/testing are banned; pass Effect Schemas directly to it.prop. Type-only imports are exempt. Files outside a src folder (vitest setup, scripts) tune the fast-check global or tooling and are allowed.',
  schema: [],
  messages: {
    rawFastCheckImport: MESSAGE,
    effectFastCheckImport: MESSAGE,
  },
} as const
