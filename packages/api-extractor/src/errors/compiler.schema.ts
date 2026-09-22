import { Schema } from 'effect'

export class TsConfigReadError extends Schema.TaggedError<TsConfigReadError>()('TsConfigReadError', {
  filePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class TypeScriptDiagnosticError extends Schema.TaggedError<TypeScriptDiagnosticError>()(
  'TypeScriptDiagnosticError',
  {
    diagnostics: Schema.Array(
      Schema.Struct({
        file: Schema.optional(Schema.String),
        line: Schema.optional(Schema.Int),
        message: Schema.String,
      }),
    ),
    cause: Schema.optional(Schema.Unknown),
  },
) {}
