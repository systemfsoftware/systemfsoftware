import { Effect, Schema as S } from 'effect'

export const TAG_NAME = '_tag' as const

export const ACTUAL_TXT = 'manual _tag member declaration' as const

export const NAME_SUFFIX = 'with manual _tag member' as const

export const ANONYMOUS_NAME = '<anonymous>' as const

export const ERROR_FIELDS: readonly string[] = ['name', 'message', 'cause']

export const EXPECTED_TAGGED_STRUCT =
  'Schema.TaggedStruct variants with type <Name> = S.Schema.Type<typeof <Name>> from effect (Schema as S from "effect")' as const

export const EXPECTED_TAGGED_ERROR =
  'Schema.TaggedError(\'<Tag>\', { ... }) from effect (Schema as S from "effect")' as const

export const EXPECTED_DERIVATION =
  'a schema with type <Name> = S.Schema.Type<typeof <Name>> from effect (Schema as S from "effect")' as const

export const FIX_TAGGED_STRUCT =
  "replace each variant with S.TaggedStruct('<Tag>', { ... }) and declare type <Name> = S.Schema.Type<typeof <Name>>" as const

export const FIX_TAGGED_ERROR = "replace the declaration with S.TaggedError('<Tag>', { ... })" as const

export const FIX_DERIVATION =
  'declare the schema (e.g. S.TaggedStruct union) and derive the type with S.Schema.Type<typeof <Name>>' as const

export const Options = S.Struct({
  allow: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
})

export type OptionsType = S.Schema.Type<typeof Options>

export const MESSAGE_FORBIDDEN = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban manual _tag members in union type literals and interface bodies. Use Schema.TaggedStruct or Schema.TaggedError from effect instead.',
  },
  schema: [Options],
  messages: {
    forbidden: MESSAGE_FORBIDDEN,
  },
} as const
