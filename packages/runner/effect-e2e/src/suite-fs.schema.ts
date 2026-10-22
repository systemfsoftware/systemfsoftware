import { Match, Predicate, Schema } from 'effect'

export class SuiteFsError extends Schema.TaggedError<SuiteFsError>()('SuiteFsError', {
  operation: Schema.String,
  path: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return Match.value(this.cause).pipe(
      Match.when(Predicate.isString, (text) => `${this.operation} ${this.path}: ${text}`),
      Match.when(Predicate.isError, (error) => `${this.operation} ${this.path}: ${error.message}`),
      Match.orElse(() => `${this.operation} ${this.path} failed`),
    )
  }
}
