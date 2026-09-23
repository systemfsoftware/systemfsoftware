import { Schema } from 'effect'

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-spec/Verdict')
export type VerdictTypeId = typeof VerdictTypeId

export class Hold extends Schema.TaggedClass<Hold>()('Hold', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class Break extends Schema.TaggedClass<Break>()('Break', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export const Verdict = Schema.Union([Hold, Break])

export type Verdict = typeof Verdict.Type
