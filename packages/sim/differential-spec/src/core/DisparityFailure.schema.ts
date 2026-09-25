import { Schema } from 'effect'

export class DisparityFailure extends Schema.TaggedError<DisparityFailure>()('DisparityFailure', {
  report: Schema.String,
}) {
  override get message(): string {
    return this.report
  }
}
