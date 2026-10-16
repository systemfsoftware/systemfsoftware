import { Schema } from 'effect'

const firstLine = (text: string): string => text.split('\n')[0] ?? ''

export class StimulusFailure extends Schema.TaggedError<StimulusFailure>()('StimulusFailure', {
  stimulus: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `The stimulus "${this.stimulus}" failed: ${firstLine(this.detail)}`
  }
}
