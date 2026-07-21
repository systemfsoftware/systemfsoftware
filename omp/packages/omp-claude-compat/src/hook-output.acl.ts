import { Schema as S } from 'effect'

const ParsedHookOutputSchema = S.Struct({
  decision: S.optional(S.String),
  reason: S.optional(S.String),
  hookSpecificOutput: S.optional(
    S.Struct({
      permissionDecision: S.optional(S.String),
      permissionDecisionReason: S.optional(S.String),
      updatedInput: S.optional(S.Record({ key: S.String, value: S.Unknown })),
    }),
  ),
})

type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

export const parseHookOutput = S.decodeUnknownEither(S.parseJson(ParsedHookOutputSchema))

export type { ParsedHookOutput }
