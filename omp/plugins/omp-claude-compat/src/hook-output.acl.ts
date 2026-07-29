import { Either, Option, Schema as S } from 'effect'

const ParsedHookOutputSchema = S.Struct({
  decision: S.optional(S.String),
  reason: S.optional(S.String),
  hookSpecificOutput: S.optional(
    S.Struct({
      permissionDecision: S.optional(S.String),
      permissionDecisionReason: S.optional(S.String),
      updatedInput: S.optional(S.Record({ key: S.String, value: S.Unknown })),
      additionalContext: S.optional(S.String),
    }),
  ),
})

type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

export const parseHookOutput = S.decodeUnknownEither(S.parseJson(ParsedHookOutputSchema))

/**
 * Claude Code hooks reference, "How async hooks execute": only
 * `hookSpecificOutput.additionalContext` reaches the model. Plain stdout is
 * debug-log only. Relay it anyway and a formatter's banner lands in the next
 * prompt as if the user typed it.
 */
export const asyncHookContext = (stdout: string): Option.Option<string> =>
  Either.match(parseHookOutput(stdout), {
    onLeft: () => Option.none(),
    onRight: (parsed) => Option.fromNullable(parsed.hookSpecificOutput?.additionalContext),
  })

export type { ParsedHookOutput }
