import { Schema } from 'effect'
import { TerminationReason } from '../kernel/TerminationReport.schema.js'

export class SupervisorTerminated extends Schema.TaggedError<SupervisorTerminated>()('SupervisorTerminated', {
  name: Schema.String,
  reason: TerminationReason,
  cause: Schema.Cause(Schema.Unknown, Schema.Unknown),
}) {}
