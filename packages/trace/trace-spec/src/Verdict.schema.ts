import { Schema } from 'effect'

export const Hold = Schema.TaggedStruct('Hold', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
})
export type Hold = typeof Hold.Type

export const Break = Schema.TaggedStruct('Break', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
})
export type Break = typeof Break.Type

export const Verdict = Schema.Union([Hold, Break])

export type Verdict = typeof Verdict.Type
