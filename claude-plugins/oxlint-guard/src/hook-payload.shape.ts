import * as S from 'effect/Schema'

// `tool_input` stays an OPEN record: each tool contributes its own keys and the OMP
// bridge synthesizes more, and a payload this guard cannot parse must still be
// classifiable so the config guard can fail closed on it rather than skip.
export const HookPayload = S.Struct({
  tool_name: S.NonEmptyString,
  tool_input: S.optional(S.Record({ key: S.String, value: S.Unknown })),
})

export type HookPayload = S.Schema.Type<typeof HookPayload>
