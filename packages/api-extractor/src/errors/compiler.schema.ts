import { Option, Predicate, Schema } from 'effect'

/** A tsconfig that could not be read, or whose parsed content carried diagnostics. */
export class TsConfigReadError extends Schema.TaggedError<TsConfigReadError>()('TsConfigReadError', {
  filePath: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return Option.match(
      Option.filter(Option.fromNullishOr(this.cause), Predicate.isString),
      {
        onNone: () => `Error reading the tsconfig.json file: ${this.filePath}`,
        onSome: (text) => `Error parsing tsconfig.json content: ${text}`,
      },
    )
  }
}

/**
 * A TypeScript compiler module that could not be loaded or does not expose the compiler API.
 * The `message` field is the emitted refusal text itself, so no getter is declared: the field
 * is what callers assert on.
 */
export class TsCompilerLoadError extends Schema.TaggedError<TsCompilerLoadError>()('TsCompilerLoadError', {
  modulePath: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
