import { Schema } from 'effect'

export class UnsupportedSyntaxError extends Schema.TaggedError<UnsupportedSyntaxError>()(
  'UnsupportedSyntaxError',
  {
    file: Schema.String,
    line: Schema.Int,
    message: Schema.String,
  },
) {}

export class UnsupportedStarExportError extends Schema.TaggedError<UnsupportedStarExportError>()(
  'UnsupportedStarExportError',
  {
    namespaceName: Schema.String,
    moduleSpecifier: Schema.String,
  },
) {}
