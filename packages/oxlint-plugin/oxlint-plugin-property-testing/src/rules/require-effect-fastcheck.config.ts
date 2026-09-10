export const FAST_CHECK_PACKAGE = 'fast-check' as const

export const EFFECT_FASTCHECK_SOURCES: Record<string, true> = {
  effect: true,
  'effect/testing': true,
}

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'FastCheck is gone — no FastCheck value import from any module. Imports from the fast-check package and FastCheck re-exports from effect or effect/testing are all banned; pass Effect Schemas directly to it.prop. Type-only imports are exempt.',
  },
  schema: [],
  messages: {
    rawFastCheckImport: MESSAGE,
    effectFastCheckImport: MESSAGE,
  },
} as const
