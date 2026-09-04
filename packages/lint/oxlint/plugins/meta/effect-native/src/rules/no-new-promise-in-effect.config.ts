export const DEFAULT_EXPECTED = 'Effect.async or Promise.withResolvers' as const
export const DEFAULT_FIX =
  'Replace with Effect.async for Effect pipelines, or Promise.withResolvers for native Promise composition' as const
export const EFFECT_MODULE = 'effect' as const
export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const PROMISE_NAME = 'Promise' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'When Effect is imported, ban new Promise(executor). Use Effect.async or Promise.withResolvers instead.',
  },
  schema: [],
  messages: {
    forbiddenNewPromise:
      '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
