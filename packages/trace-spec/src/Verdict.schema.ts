import { Schema } from 'effect'

export class Hold extends Schema.TaggedClass<Hold>()('Hold', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
}) {}

export class Break extends Schema.TaggedClass<Break>()('Break', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {}

export const Verdict = Schema.Union([Hold, Break])

export type Verdict = typeof Verdict.Type
