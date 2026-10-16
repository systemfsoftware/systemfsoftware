import { Schema } from 'effect'
import { Probability } from './Route.schema.js'

const ClassifyAnswer = Schema.TaggedStruct('Classify', {
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Probability),
  confidence: Schema.optional(Schema.Finite),
})

const RateAnswer = Schema.TaggedStruct('Rate', {
  rating: Schema.Finite,
  probabilities: Schema.Record(Schema.String, Probability),
  confidence: Schema.optional(Schema.Finite),
})

const ProbabilityAnswer = Schema.TaggedStruct('Probability', {
  probability: Schema.Finite,
})

export const ProviderAnswer = Schema.Union([ClassifyAnswer, RateAnswer, ProbabilityAnswer])
export type ProviderAnswer = typeof ProviderAnswer.Type

export const SnapshotVersion = Schema.Struct({ version: Schema.Finite })

export const Observation = Schema.Struct({
  decisionId: Schema.String,
  fingerprint: Schema.String,
  kind: Schema.Literals(['Classify', 'Rate', 'Probability']),
  region: Schema.Array(Schema.String),
  answer: ProviderAnswer,
})
export type Observation = typeof Observation.Type

export const Observations = Schema.Struct({
  version: Schema.Literal(2),
  entries: Schema.Record(Schema.String, Observation),
})
export type Observations = typeof Observations.Type

export class UnsupportedObservationFormatError extends Schema.TaggedError<UnsupportedObservationFormatError>()(
  'UnsupportedObservationFormatError',
  {
    version: Schema.Finite,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Observation snapshot version ${this.version} is unsupported: ${this.detail}`
  }
}

export class MalformedObservationSnapshotError extends Schema.TaggedError<MalformedObservationSnapshotError>()(
  'MalformedObservationSnapshotError',
  {
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `The observation snapshot is malformed: ${this.detail}`
  }
}

export type ObservationSnapshotRefused = UnsupportedObservationFormatError | MalformedObservationSnapshotError
