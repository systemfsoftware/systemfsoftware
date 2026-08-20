import { Schema } from 'effect'

export class PackageSourceError extends Schema.TaggedError<PackageSourceError>()('PackageSourceError', {
  message: Schema.String,
}) {}
