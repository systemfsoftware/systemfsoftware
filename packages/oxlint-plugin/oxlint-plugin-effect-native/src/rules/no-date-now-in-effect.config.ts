export const DEFAULT_EXPECTED = 'yield* Clock.currentTimeMillis (Clock from effect)' as const
export const EFFECT_MODULE = 'effect' as const
export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const DATE_NAME = 'Date' as const
export const NOW_NAME = 'now' as const
export const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?tsx?$/

export const meta = {
  type: 'problem',
  docs: {
    description:
      'When Effect is imported, ban Date.now() (including inside Effect.sync). A clock read is an effect — use Clock.currentTimeMillis so it is controllable under TestClock.',
  },
  schema: [],
  messages: {
    forbiddenDateNow:
      'Date.now() is forbidden when Effect is imported. Expected: {{expected}}. Wrapping it as Effect.sync(() => Date.now()) is not an escape hatch — take the clock from the runtime.',
  },
} as const
