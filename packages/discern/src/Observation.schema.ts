import { Schema } from 'effect'

const ClassifyAnswer = Schema.TaggedStruct('Classify', {
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  confidence: Schema.optional(Schema.Finite),
})

const RateAnswer = Schema.TaggedStruct('Rate', {
  rating: Schema.Finite,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  confidence: Schema.optional(Schema.Finite),
})

const ProbabilityAnswer = Schema.TaggedStruct('Probability', {
  probability: Schema.Finite,
})

export const ProviderAnswer = Schema.Union([ClassifyAnswer, RateAnswer, ProbabilityAnswer])
export type ProviderAnswer = typeof ProviderAnswer.Type

export const SnapshotVersion = Schema.Struct({ version: Schema.Finite })

export class Observation extends Schema.Class<Observation>('Observation')({
  decisionId: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literals(['Classify', 'Rate', 'Probability']),
  region: Schema.Array(Schema.String),
  answer: ProviderAnswer,
}) {}

export class Observations extends Schema.Class<Observations>('Observations')({
  version: Schema.Literal(2),
  entries: Schema.Record(Schema.String, Observation),
}) {}

export class UnsupportedObservationFormatError extends Schema.TaggedError<UnsupportedObservationFormatError>()(
  'UnsupportedObservationFormatError',
  {
    version: Schema.Finite,
    detail: Schema.String,
  },
) {}

export class MalformedObservationSnapshotError extends Schema.TaggedError<MalformedObservationSnapshotError>()(
  'MalformedObservationSnapshotError',
  {
    detail: Schema.String,
  },
) {}

export type ObservationSnapshotRefused = UnsupportedObservationFormatError | MalformedObservationSnapshotError
