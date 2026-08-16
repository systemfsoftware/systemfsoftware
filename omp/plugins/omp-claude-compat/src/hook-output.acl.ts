import { Effect, Schema as S, SchemaGetter } from 'effect'

const ParsedHookOutputSchema = S.Struct({
  decision: S.optional(S.String),
  reason: S.optional(S.String),
  hookSpecificOutput: S.optional(
    S.Struct({
      permissionDecision: S.optional(S.String),
      permissionDecisionReason: S.optional(S.String),
      updatedInput: S.optional(S.Record(S.String, S.Unknown)),
      additionalContext: S.optional(S.String),
    }),
  ),
})

type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

/**
 * The crossing at the hook boundary: the child process's stdout (foreign wire
 * text) into the domain's parsed hook output. Decode-only — the bridge never
 * writes hook output back to a string, so encoding is Forbidden.
 *
 * `Schema.decodeTo` with `SchemaGetter.transformOrFail` keeps the decode inside
 * Schema's identity contract: `fromJsonString` parses the wire text and the
 * parsed value is decoded through the schema itself, never cast. Constitutes
 * ACL1 (see `omp/AGENTS.md`).
 */
const HookOutputFromStdout = S.String.pipe(
  S.decodeTo(S.toType(ParsedHookOutputSchema), {
    decode: SchemaGetter.transformOrFail((stdout) =>
      S.decodeUnknownEffect(S.fromJsonString(S.toType(ParsedHookOutputSchema)))(stdout).pipe(
        Effect.mapError((err) => (S.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.forbidden(() => 'HookOutputFromStdout is decode-only'),
  }),
)

export const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)

export type { ParsedHookOutput }
