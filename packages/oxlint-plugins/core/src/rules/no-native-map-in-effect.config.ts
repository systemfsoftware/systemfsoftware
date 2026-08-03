import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String,
    { default: () => 'HashMap from effect (HashMap.empty() or HashMap.fromIterable())' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        'Replace with HashMap.empty() for empty maps, or HashMap.fromIterable(iterable) for maps with initial data',
    },
  ),
})

export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const EFFECT_MODULE = 'effect' as const
export const MAP_NAME = 'Map' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'When Effect is imported, ban native Map (new Map). Use HashMap from effect instead.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    forbiddenMap:
      '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
