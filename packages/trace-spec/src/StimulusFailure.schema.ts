import { Schema } from 'effect'

export class StimulusFailure extends Schema.TaggedError<StimulusFailure>()('StimulusFailure', {
  stimulus: Schema.String,
  detail: Schema.String,
}) {}
