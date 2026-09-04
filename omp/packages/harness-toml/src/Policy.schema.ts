import { parse, stringify } from '@std/toml'
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

export const Policy = Schema.Record(
  Schema.String.pipe(
    Schema.check(
      Schema.makeFilter((key) => key !== '__proto__', {
        arbitrary: {
          candidate: {
            make: (fc) => fc.string().map((key) => (key === '__proto__' ? `${key}!` : key)),
          },
        },
      }),
    ),
  ),
  Schema.Array(Schema.String),
).pipe(
  Schema.brand('Policy'),
)
export type Policy = Schema.Schema.Type<typeof Policy>

const TOML_PARSE_ERROR = (e: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({
    message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
  })

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
