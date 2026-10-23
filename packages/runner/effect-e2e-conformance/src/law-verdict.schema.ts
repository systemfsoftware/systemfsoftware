import * as Schema from 'effect/Schema'

export const LawVerdict = Schema.Union([
  Schema.TaggedStruct('LawHeld', { law: Schema.String }),
  Schema.TaggedStruct('LawSkipped', { law: Schema.String, reason: Schema.String }),
  Schema.TaggedStruct('LawBroken', { law: Schema.String, expected: Schema.String, observed: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type LawVerdict = typeof LawVerdict.Type

export const LawCheck = Schema.Union([
  Schema.TaggedStruct('Compared', { expected: Schema.String, observed: Schema.String }),
  Schema.TaggedStruct('Skipped', { reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type LawCheck = typeof LawCheck.Type
