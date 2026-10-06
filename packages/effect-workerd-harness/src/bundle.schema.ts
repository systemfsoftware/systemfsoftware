import { Schema } from 'effect'

export class WorkerBundleFailed extends Schema.TaggedError<WorkerBundleFailed>()('WorkerBundleFailed', {
  entry: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `could not bundle the Worker entry ${this.entry}`
  }
}
