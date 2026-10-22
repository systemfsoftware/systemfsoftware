import { Match, Predicate, Schema } from 'effect'

export class AssertionFailed extends Schema.TaggedError<AssertionFailed>()('AssertionFailed', {
  message: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class EngineUnavailable extends Schema.TaggedError<EngineUnavailable>()('EngineUnavailable', {
  operation: Schema.String,
}) {
  override get message(): string {
    return `no live engine is wired for ${this.operation}`
  }
}

export class TestThrew extends Schema.TaggedError<TestThrew>()('TestThrew', {
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return Match.value(this.cause).pipe(
      Match.when(Predicate.isString, (text) => text),
      Match.when(Predicate.isError, (error) => error.message),
      Match.orElse(() => 'the test threw a value that is not an Error'),
    )
  }
}

export class RunnerDefect extends Schema.TaggedError<RunnerDefect>()('RunnerDefect', {
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return Match.value(this.cause).pipe(
      Match.when(Predicate.isString, (text) => `internal error: ${text}`),
      Match.when(Predicate.isError, (error) => `internal error: ${error.message}`),
      Match.orElse(() => 'internal error: the runner died with a value that is not an Error'),
    )
  }
}

export class CollectionFailed extends Schema.TaggedError<CollectionFailed>()('CollectionFailed', {
  message: Schema.String,
}) {}

export class SuiteExists extends Schema.TaggedError<SuiteExists>()('SuiteExists', {
  path: Schema.String,
}) {
  override get message(): string {
    return `${this.path} already exists; pass --force to replace the suite`
  }
}

export class InstallFailed extends Schema.TaggedError<InstallFailed>()('InstallFailed', {
  message: Schema.String,
}) {}

export class ReportInvalid extends Schema.TaggedError<ReportInvalid>()('ReportInvalid', {
  message: Schema.String,
}) {}
