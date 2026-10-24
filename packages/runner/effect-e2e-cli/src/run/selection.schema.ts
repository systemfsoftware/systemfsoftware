import * as Schema from 'effect/Schema'

export const Selection = Schema.Union([
  Schema.TaggedStruct('Files', { filters: Schema.Array(Schema.String) }),
  Schema.TaggedStruct('LastFailed', {}),
]).pipe(Schema.toTaggedUnion('_tag'))
export type Selection = typeof Selection.Type
