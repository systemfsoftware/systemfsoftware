import { parse, stringify } from '@std/toml'
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

/**
 * Schema: TOML config — the inner vocabulary of `systemfsoftware.toml`.
 *
 * Shape: a record of string key to string array. The only consumer of the inner
 * keys is the agent-discipline plugin (it reads `no_delegate_skills`); other
 * plugins may add their own keys without this schema changing. Branding makes
 * a parsed config distinguishable from a raw record and surfaces shape errors
 * through the loader's parse path.
 *
 * The key check exists because the TOML bridge is the source of truth on the
 * alphabet: `@std/toml`'s parse silently drops a `__proto__` key, so a record
 * claiming every string key would make the codec lossy for it (measured
 * 2026-08-17: the round-trip law failed with `{"__proto__": []}`). Excluding
 * the name — the one lossy key in the parser — keeps the round-trip.
 */
export const TomlConfig = Schema.Record(
  Schema.String.pipe(Schema.check(Schema.makeFilter((key) => key !== '__proto__'))),
  Schema.Array(Schema.String),
).pipe(
  Schema.brand('TomlConfig'),
)
export type TomlConfig = Schema.Schema.Type<typeof TomlConfig>

const TOML_PARSE_ERROR = (e: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({
    message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
  })

/**
 * TOML text → `TomlConfig`, declared beside the type it produces.
 *
 * The only place in this package that imports `@std/toml`, so the foreign parser is
 * contained at one boundary. `Schema.decodeTo` with `SchemaGetter.transformOrFail` makes the
 * decode go through Schema's identity contract — branding is earned by
 * `Schema.decodeUnknownEffect(TomlConfig)`, never by a cast. `@std/toml`'s `stringify`
 * owns the encode side, so the codec round-trips: `stringify` is stable under
 * `parse ∘ stringify` (measured 2026-08-17), which keeps the encode-stability law.
 */
export const TomlConfigFromText: Schema.Codec<TomlConfig, string> = Schema.String.pipe(
  Schema.decodeTo(Schema.toType(TomlConfig), {
    decode: SchemaGetter.transformOrFail((raw) =>
      Effect.try({
        try: () => parse(raw),
        catch: TOML_PARSE_ERROR,
      }).pipe(
        Effect.flatMap((parsed) => Schema.decodeUnknownEffect(TomlConfig)(parsed)),
        Effect.mapError((err) => (Schema.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.transform((config: TomlConfig) => stringify(config)),
  }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  const { FastCheck: fc } = await import('effect/testing')

  // The sole obligation: the parse boundary accepts any string, so a non-TOML
  // document is the refusal class. Drawn as one constant wire form.
  refutes(TomlConfigFromText, {
    TomlConfigFromTextUnparseable: fc.constant('not a toml document'),
  })
}
