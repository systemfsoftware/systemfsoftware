import { Schema } from 'effect'

export class ConfigFileNotFound extends Schema.TaggedError<ConfigFileNotFound>()('ConfigFileNotFound', {
  filePath: Schema.String,
}) {}

export class ConfigJsonSyntaxError extends Schema.TaggedError<ConfigJsonSyntaxError>()('ConfigJsonSyntaxError', {
  filePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class ConfigSchemaValidationError extends Schema.TaggedError<ConfigSchemaValidationError>()(
  'ConfigSchemaValidationError',
  {
    filePath: Schema.String,
    issues: Schema.Array(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class UnresolvedTokenError extends Schema.TaggedError<UnresolvedTokenError>()('UnresolvedTokenError', {
  token: Schema.String,
  configPath: Schema.String,
}) {}

export class CircularConfigExtendsError extends Schema.TaggedError<CircularConfigExtendsError>()(
  'CircularConfigExtendsError',
  {
    chain: Schema.Array(Schema.String),
  },
) {}
