import { Schema } from 'effect'

export class TestDomainError
  extends Schema.TaggedError<TestDomainError, { readonly brand: unique symbol }>()('TestDomainError', {
    message: Schema.String,
  })
{}

export class AccessDenied
  extends Schema.TaggedError<AccessDenied, { readonly brand: unique symbol }>()('AccessDenied', {
    user: Schema.String,
  })
{}
