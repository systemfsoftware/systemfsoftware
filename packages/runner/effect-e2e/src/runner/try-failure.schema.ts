import * as Schema from 'effect/Schema'

import { FailureCode } from '../verdict/failure.schema.js'
import { RunStatus } from '../verdict/run-verdict.schema.js'

export class AttemptFailed extends Schema.TaggedError<AttemptFailed>()('AttemptFailed', {
  status: RunStatus,
  codes: Schema.Array(FailureCode),
}) {
  override get message(): string {
    return `the attempt ended ${this.status}: ${this.codes.join(', ')}`
  }
}
