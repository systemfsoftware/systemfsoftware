import { Schema } from 'effect'

export class PathCoverageError extends Schema.TaggedError<PathCoverageError>()('PathCoverageError', {
  machine: Schema.String,
  uncovered: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `machine ${this.machine} has no generated path covering ${this.uncovered.join(', ')}`
  }
}

export class SnapshotRoundTripError extends Schema.TaggedError<SnapshotRoundTripError>()(
  'SnapshotRoundTripError',
  {
    machine: Schema.String,
    states: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `machine ${this.machine} does not round-trip snapshots through restore: ${this.states.join(', ')}`
  }
}
