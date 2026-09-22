import { Schema } from 'effect'

export class TsConfigReadError extends Schema.TaggedError<TsConfigReadError>()('TsConfigReadError', {
  filePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class TsCompilerLoadError extends Schema.TaggedError<TsCompilerLoadError>()('TsCompilerLoadError', {
  modulePath: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
