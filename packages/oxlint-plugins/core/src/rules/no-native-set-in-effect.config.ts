import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String,
    { default: () => 'HashSet from effect (HashSet.empty() or HashSet.fromIterable())' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        'Replace with HashSet.empty() for empty sets, or HashSet.fromIterable(iterable) for sets with initial data',
    },
  ),
})

export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const EFFECT_MODULE = 'effect' as const
export const SET_NAME = 'Set' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'When Effect is imported, ban native Set (new Set). Use HashSet from effect instead.',
  },
  schema: [JSONSchema.make(Options)],
  messages: {
    forbiddenSet:
      '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
