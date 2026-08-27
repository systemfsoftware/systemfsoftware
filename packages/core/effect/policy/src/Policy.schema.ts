import { parse, stringify } from '@std/toml'
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

/**
 * Schema: the harness policy value — the inner vocabulary of the policy file.
 *
 * Shape: a record of string key to string array. Consumers read their own keys
 * (`no_delegate_skills`, `no_inject_refs`, …); a plugin may add keys without
 * this schema changing. Branding makes a resolved policy distinguishable from
 * a raw record and surfaces shape errors through the adapter's parse path.
 *
 * The key check exists because the TOML bridge is the source of truth on the
 * alphabet: `@std/toml`'s parse silently drops a `__proto__` key, so a record
 * claiming every string key would make the codec lossy for it (measured
 * 2026-08-17: the round-trip law failed with `{"__proto__": []}`). Excluding
 * the name — the one lossy key in the parser — keeps the round-trip.
 */
export const Policy = Schema.Record(
  Schema.String.pipe(Schema.check(Schema.makeFilter((key) => key !== '__proto__'))),
  Schema.Array(Schema.String),
).pipe(
  Schema.brand('Policy'),
)
export type Policy = Schema.Schema.Type<typeof Policy>

const TOML_PARSE_ERROR = (e: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({
    message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
  })

/**
 * TOML text → `Policy`, declared beside the type it produces.
 *
 * The only place in this package that imports `@std/toml`, so the foreign parser is
 * contained at one boundary. `Schema.decodeTo` with `SchemaGetter.transformOrFail` makes the
 * decode go through Schema's identity contract — branding is earned by
 * `Schema.decodeUnknownEffect(Policy)`, never by a cast. `@std/toml`'s `stringify`
 * owns the encode side, so the codec round-trips: `stringify` is stable under
 * `parse ∘ stringify` (measured 2026-08-17), which keeps the encode-stability law.
 */
export const PolicyFromToml: Schema.Codec<Policy, string> = Schema.String.pipe(
  Schema.decodeTo(Schema.toType(Policy), {
    decode: SchemaGetter.transformOrFail((raw) =>
      Effect.try({
        try: () => parse(raw),
        catch: TOML_PARSE_ERROR,
      }).pipe(
        Effect.flatMap((parsed) => Schema.decodeUnknownEffect(Policy)(parsed)),
        Effect.mapError((err) => (Schema.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.transform((policy: Policy) => stringify(policy)),
  }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { refutes } = await import('@systemfsoftware/effect-schema-law/refutation')
  const { FastCheck: fc } = await import('effect/testing')

  // The sole obligation: the parse boundary accepts any string, so a non-TOML
  // document is the refusal class. Drawn as one constant wire form.
  refutes(PolicyFromToml, {
    PolicyFromTomlUnparseable: fc.constant('not a toml document'),
  })
}
