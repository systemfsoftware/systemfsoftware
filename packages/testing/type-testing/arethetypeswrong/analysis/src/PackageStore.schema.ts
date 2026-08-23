import { Schema } from 'effect'

/** No published version satisfied any of the requested specs. */
export class PackageNotFoundError extends Schema.TaggedError<PackageNotFoundError>()('PackageNotFoundError', {
  packageName: Schema.String,
}) {}

/** A registry request failed or answered with something the reader cannot use. */
export class PackageStoreError extends Schema.TaggedError<PackageStoreError>()('PackageStoreError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
