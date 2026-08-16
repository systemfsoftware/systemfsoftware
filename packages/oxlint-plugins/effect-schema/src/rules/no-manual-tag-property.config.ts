import { Effect, Schema as S } from 'effect'

export const TAG_NAME = '_tag' as const

export const DEFAULT_EXPECTED =
  'Schema.TaggedClass or Schema.TaggedError from effect (Schema as S from "effect")' as const

export const DEFAULT_FIX =
  "Replace manual _tag with class MyClass extends S.TaggedClass<MyClass>('TagName')('variantName', { ... }) {} for variants, or class MyError extends S.TaggedError<MyError>()('MyError', { ... }) {} for errors" as const

export const ACTUAL_TXT = 'manual _tag property declaration' as const

export const NAME_SUFFIX = 'with manual _tag property' as const

export const ANONYMOUS_NAME = '<anonymous>' as const

export const Options = S.Struct({
  allow: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
  expected: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed(DEFAULT_EXPECTED)),
  ),
  fix: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed(DEFAULT_FIX)),
  ),
})

export type OptionsType = S.Schema.Type<typeof Options>

export const MESSAGE_FORBIDDEN = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban classes that declare their own _tag property. Use TaggedClass or TaggedError from effect instead.',
  },
  schema: [Options],
  messages: {
    forbidden: MESSAGE_FORBIDDEN,
  },
} as const
