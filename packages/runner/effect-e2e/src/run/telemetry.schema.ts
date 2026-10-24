import * as Schema from 'effect/Schema'

/** The counted events of design §14: replay outcomes, model calls, and token usage. */
export const TelemetryCount = Schema.Union([
  Schema.TaggedStruct('ReplayOutcome', {
    outcome: Schema.Literals(['replayed', 'handed_off', 'missed']),
  }),
  Schema.TaggedStruct('ModelCall', {}),
  Schema.TaggedStruct('ModelTokens', {
    kind: Schema.Literals(['input', 'output']),
    tokens: Schema.Finite,
  }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type TelemetryCount = typeof TelemetryCount.Type
