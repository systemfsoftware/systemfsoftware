import { JSONSchema, Schema as S } from 'effect'

export const DEFAULT_EXPECTED =
  'Effect Match API or type guards — Match.tag(value, { Tag1: () => ... }), Result.isSuccess/Result.isFailure, Either.isLeft/Either.isRight, Exit.isSuccess/Exit.isFailure, Option.isSome/Option.isNone' as const
export const DEFAULT_FIX =
  'Replace obj._tag === "X" with Match.tag(obj, { X: () => ... }) or use Result.isSuccess/isFailure, Either.isLeft/isRight, Exit.isSuccess/isFailure, Option.isSome/isNone as appropriate' as const

export const OptionsElement = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description: 'Allowed _tag access expressions (e.g., ["result._tag"])',
    })),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String.pipe(S.annotations({
      description: 'Custom expected message',
    })),
    { default: () => DEFAULT_EXPECTED },
  ),
  fix: S.optionalWith(
    S.String.pipe(S.annotations({
      description: 'Custom fix message',
    })),
    { default: () => DEFAULT_FIX },
  ),
})

export const TAG_NAME = '_tag' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'Ban direct _tag access. Configurable: expected, fix, allow.',
  },
  schema: [
    JSONSchema.make(OptionsElement),
  ],
  messages: {
    forbidden: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
