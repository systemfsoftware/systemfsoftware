/**
 * ACL: TOML text → `TomlConfig`.
 *
 * The only file in this package that imports `@std/toml`. Anything that
 * decodes from outside the domain types routes through here so the foreign
 * parser is contained at one boundary.
 *
 * `Schema.transformOrFail` with `strict: true` makes the decode go through
 * Schema's identity contract — branding is earned by `ParseResult.decode`,
 * never by a cast. Encode is `Forbidden` because the TOML format is the
 * source, not the destination. Constitutes ACL1 (see `omp/AGENTS.md`).
 */
import { parse } from '@std/toml'
import { ParseResult, Schema as S } from 'effect'
import { TomlConfig } from './toml-loader.schema.js'

export const TomlConfigFromText: S.transform<S.Schema<string>, S.SchemaClass<TomlConfig>> = S
  .transformOrFail(
    S.String,
    S.typeSchema(TomlConfig),
    {
      strict: true,
      decode: (raw) =>
        ParseResult.try({
          try: () => parse(raw),
          catch: (e) => new ParseResult.Unexpected(e, 'TOML parse error'),
        }).pipe(
          ParseResult.flatMap((parsed) => ParseResult.decodeUnknown(TomlConfig)(parsed)),
        ),
      encode: (_, _d, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'TomlConfigFromText is decode-only')),
    },
  )
