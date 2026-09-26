import { Schema } from 'effect'

export class ReportWriteRefusedError extends Schema.TaggedError<ReportWriteRefusedError>()(
  'ReportWriteRefusedError',
  {
    text: Schema.String,
  },
) {
  override get message(): string {
    return this.text
  }
}
