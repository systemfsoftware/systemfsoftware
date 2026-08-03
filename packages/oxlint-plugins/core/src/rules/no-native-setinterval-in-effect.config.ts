export const DEFAULT_EXPECTED_SETINTERVAL = 'Effect.repeat with Schedule' as const
export const DEFAULT_EXPECTED_CLEARINTERVAL = 'Effect.fiberId + Fiber.interrupt' as const

export const EFFECT_MODULE = 'effect' as const
export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const SET_INTERVAL = 'setInterval' as const
export const CLEAR_INTERVAL = 'clearInterval' as const

export const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(['globalThis', 'window', 'self'])

export const meta = {
  type: 'problem',
  docs: {
    description:
      'When Effect is imported, ban native setInterval/clearInterval. Use Effect.repeat with Schedule instead.',
  },
  schema: [],
  messages: {
    forbiddenSetInterval:
      'setInterval is forbidden when Effect is imported. Expected: {{expected}}. Actual: setInterval.',
    forbiddenClearInterval:
      'clearInterval is forbidden when Effect is imported. Expected: {{expected}}. Actual: clearInterval.',
  },
} as const
