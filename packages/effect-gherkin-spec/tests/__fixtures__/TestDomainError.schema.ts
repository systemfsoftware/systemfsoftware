import { Schema } from 'effect'

export class TestDomainError extends Schema.TaggedError<TestDomainError>()('TestDomainError', {
  message: Schema.String,
}) {}
