import { Schema } from 'effect'

export class TestDomainError extends Schema.TaggedError<TestDomainError>()('TestDomainError', {
  message: Schema.String,
}) {}

export class AccessDenied extends Schema.TaggedError<AccessDenied>()('AccessDenied', {
  user: Schema.String,
}) {}
