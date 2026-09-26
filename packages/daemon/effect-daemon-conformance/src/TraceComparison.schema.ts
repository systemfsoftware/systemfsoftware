import { Schema } from 'effect'

const ComparisonTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-conformance/TraceComparison')
type ComparisonTypeId = typeof ComparisonTypeId

export class TracesConform extends Schema.TaggedClass<TracesConform>()('TracesConform', {
  scenario: Schema.String,
  medium: Schema.String,
  compared: Schema.Int,
}) {
  readonly [ComparisonTypeId] = ComparisonTypeId
}

export class TracesDiverge extends Schema.TaggedClass<TracesDiverge>()('TracesDiverge', {
  scenario: Schema.String,
  medium: Schema.String,
  index: Schema.Int,
  reference: Schema.String,
  candidate: Schema.String,
}) {
  readonly [ComparisonTypeId] = ComparisonTypeId
}

export const TraceComparison = Schema.Union([TracesConform, TracesDiverge])
export type TraceComparison = typeof TraceComparison.Type
