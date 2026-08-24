import { Effect, Schema as S, SchemaGetter } from 'effect'

export const ParsedHookOutputSchema = S.Struct({
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
}).pipe(
  // The wire is JSON, which cannot carry a present-but-undefined optional key,
  // so the law domain is the wire-representable subset: every optional key
  // present with a real value. Mirror of CompiledGuard's `toArbitrary` in
  // omp-agent-discipline — the arbitrary is the codec's honest input space.
  S.annotate({
    toArbitrary: () => (fc) =>
      fc.record({
        decision: fc.string(),
        reason: fc.string(),
        hookSpecificOutput: fc.record({
          permissionDecision: fc.string(),
          permissionDecisionReason: fc.string(),
          updatedInput: fc.dictionary(fc.string(), fc.jsonValue()),
          additionalContext: fc.string(),
        }),
      }),
  }),
)

export type ParsedHookOutput = S.Schema.Type<typeof ParsedHookOutputSchema>

/**
 * The crossing at the hook boundary: the child process's stdout (foreign wire
 * text) into the domain's parsed hook output. `S.fromJsonString` parses the
 * wire text and the parsed value is decoded through the schema itself, never
 * cast. `JSON.stringify` owns the encode side so the codec round-trips
 * (constitutes ACL1, see `omp/AGENTS.md`).
 */
export const HookOutputFromStdout = S.String.pipe(
  S.decodeTo(S.toType(ParsedHookOutputSchema), {
    decode: SchemaGetter.transformOrFail((stdout) =>
      S.decodeUnknownEffect(S.fromJsonString(S.toType(ParsedHookOutputSchema)))(stdout).pipe(
        Effect.mapError((err) => (S.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.transform((output: ParsedHookOutput) => JSON.stringify(output)),
  }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { refutes } = await import('@systemfsoftware/effect-schema-law/refutation')
  const { FastCheck: fc } = await import('effect/testing')

  // The sole obligation: the parse boundary accepts any string, so a non-JSON
  // document is the refusal class. Drawn as one constant wire form.
  refutes(HookOutputFromStdout, {
    HookOutputFromStdoutNonJson: fc.constant('not json at all'),
  })
}
