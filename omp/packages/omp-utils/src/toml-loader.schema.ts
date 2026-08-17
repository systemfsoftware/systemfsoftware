import { parse } from '@std/toml'
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

/**
 * Schema: TOML config — the inner vocabulary of `systemfsoftware.toml`.
 *
 * Shape: a record of string key to string array. The only consumer of the inner
 * keys is the agent-discipline plugin (it reads `no_delegate_skills`); other
 * plugins may add their own keys without this schema changing. Branding makes
 * a parsed config distinguishable from a raw record and surfaces shape errors
 * through the loader's parse path.
 */
export const TomlConfig = Schema.Record(Schema.String, Schema.Array(Schema.String)).pipe(
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
 * `Schema.decodeUnknownEffect(TomlConfig)`, never by a cast. Encode is `Forbidden` because
 * the TOML format is the source, not the destination.
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
    encode: SchemaGetter.forbidden(() => 'TomlConfigFromText is decode-only'),
  }),
)
