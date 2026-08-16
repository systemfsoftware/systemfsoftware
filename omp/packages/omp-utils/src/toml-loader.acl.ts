/**
 * ACL: TOML text → `TomlConfig`.
 *
 * The only file in this package that imports `@std/toml`. Anything that
 * decodes from outside the domain types routes through here so the foreign
 * parser is contained at one boundary.
 *
 * `Schema.decodeTo` with `SchemaGetter.transformOrFail` makes the decode go
 * through Schema's identity contract — branding is earned by
 * `Schema.decodeUnknownEffect(TomlConfig)`, never by a cast. Encode is
 * `Forbidden` because the TOML format is the source, not the destination.
 * Constitutes ACL1 (see `omp/AGENTS.md`).
 */
import { parse } from '@std/toml'
import { Effect, Schema as S, SchemaGetter, SchemaIssue } from 'effect'
import { TomlConfig } from './toml-loader.schema.js'

const TOML_PARSE_ERROR = (e: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({
    message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
  })

export const TomlConfigFromText: S.Codec<TomlConfig, string> = S.String.pipe(
  S.decodeTo(S.toType(TomlConfig), {
    decode: SchemaGetter.transformOrFail((raw) =>
      Effect.try({
        try: () => parse(raw),
        catch: TOML_PARSE_ERROR,
      }).pipe(
        Effect.flatMap((parsed) => S.decodeUnknownEffect(TomlConfig)(parsed)),
        Effect.mapError((err) => (S.isSchemaError(err) ? err.issue : err)),
      )
    ),
    encode: SchemaGetter.forbidden(() => 'TomlConfigFromText is decode-only'),
  }),
)
