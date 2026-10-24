import * as Schema from 'effect/Schema'

export const TelemetryCount = Schema.Union([
  Schema.TaggedStruct('ReplayOutcome', {
    outcome: Schema.Literals(['replayed', 'handed_off', 'missed']),
  }),
  Schema.TaggedStruct('ModelCalls', {
    calls: Schema.Finite,
  }),
  Schema.TaggedStruct('ModelTokens', {
    kind: Schema.Literals(['input', 'output']),
    tokens: Schema.Finite,
  }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type TelemetryCount = typeof TelemetryCount.Type
