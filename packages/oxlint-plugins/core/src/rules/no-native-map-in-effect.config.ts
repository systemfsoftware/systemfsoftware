import { Effect, Schema as S } from 'effect'

export const Options = S.Struct({
  allow: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
  expected: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed('HashMap from effect (HashMap.empty() or HashMap.fromIterable())')),
  ),
  fix: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed(
      'Replace with HashMap.empty() for empty maps, or HashMap.fromIterable(iterable) for maps with initial data',
    )),
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
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    forbiddenMap:
      '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
