import { Effect, Schema as S } from 'effect'

export const Options = S.Struct({
  allow: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
  expected: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed('HashSet from effect (HashSet.empty() or HashSet.fromIterable())')),
  ),
  fix: S.String.pipe(
    S.withDecodingDefaultType(
      Effect.succeed(
        'Replace with HashSet.empty() for empty sets, or HashSet.fromIterable(iterable) for sets with initial data',
      ),
    ),
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
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    forbiddenSet:
      '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
