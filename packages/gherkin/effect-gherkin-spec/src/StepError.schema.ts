import { Schema } from 'effect'
import { failureMessage } from './FailureSummary.js'

/**
 * Derives `message` from `keyword`, `text` and `cause`, so a step failure never prints an empty
 * headline. Declared as a getter because a `message` field would change the error's encoded shape.
 */
export class StepError extends Schema.TaggedError<StepError>()('StepError', {
  keyword: Schema.String,
  text: Schema.String,
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return failureMessage({ keyword: this.keyword, text: this.text, cause: this.cause })
  }
}
