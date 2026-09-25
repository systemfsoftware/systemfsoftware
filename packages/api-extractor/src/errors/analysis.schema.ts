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
) {
  override get message(): string {
    return `The "${this.namespaceName}" namespace import includes a star export, which is not supported:\n${this.moduleSpecifier}`
  }
}

export class MissingMainEntryPointError extends Schema.TaggedError<MissingMainEntryPointError>()(
  'MissingMainEntryPointError',
  {
    filePath: Schema.String,
  },
) {
  override get message(): string {
    return `Unable to load file: ${this.filePath}`
  }
}
