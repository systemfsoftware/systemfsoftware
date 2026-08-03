import { Effect, ParseResult, Schema as S } from 'effect'

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

/**
 * The crossing at the hook boundary: the child process's stdout (foreign wire
 * text) into the domain's parsed hook output. Decode-only — the bridge never
 * writes hook output back to a string, so encoding is Forbidden.
 */
const HookOutputFromStdout = S.transformOrFail(S.String, ParsedHookOutputSchema, {
  strict: true,
  decode: (stdout) =>
    Effect.mapError(S.decodeUnknown(S.parseJson(ParsedHookOutputSchema))(stdout), (error) => error.issue),
  encode: (parsed, _options, ast) =>
    ParseResult.fail(new ParseResult.Forbidden(ast, parsed, 'Decode-only: hook stdout is never encoded')),
})

export const parseHookOutput = S.decodeUnknownEither(HookOutputFromStdout)

export type { ParsedHookOutput }
