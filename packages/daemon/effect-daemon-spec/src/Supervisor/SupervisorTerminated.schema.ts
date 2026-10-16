import { Cause, Schema } from 'effect'
import { TerminationReason } from '../kernel/TerminationReport.schema.js'

const firstLine = (text: string): string => text.split('\n')[0] ?? ''

export class SupervisorTerminated extends Schema.TaggedError<SupervisorTerminated>()('SupervisorTerminated', {
  name: Schema.String,
  reason: TerminationReason,
  cause: Schema.Cause(Schema.Unknown, Schema.Unknown),
}) {
  override get message(): string {
    return `Supervisor "${this.name}" terminated (${this.reason._tag}): ${firstLine(Cause.pretty(this.cause))}`
  }
}
