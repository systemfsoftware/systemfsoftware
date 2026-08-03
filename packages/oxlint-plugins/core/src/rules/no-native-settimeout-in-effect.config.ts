export const DEFAULT_EXPECTED = 'Effect.delay or Effect.sleep' as const
export const EFFECT_MODULE = 'effect' as const
export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const SET_TIMEOUT = 'setTimeout' as const

export const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(['globalThis', 'window', 'self'])

export const meta = {
  type: 'problem',
  docs: {
    description: 'When Effect is imported, ban native setTimeout. Use Effect.delay or Effect.sleep instead.',
  },
  schema: [],
  messages: {
    forbiddenSetTimeout:
      'setTimeout is forbidden when Effect is imported. Expected: {{expected}}. Use Effect.delay or Effect.sleep.',
  },
} as const
