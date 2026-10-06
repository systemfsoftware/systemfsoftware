import { Schema } from 'effect'

export const LedgerJsonView = Schema.Struct({
  entries: Schema.Array(Schema.Struct({ id: Schema.String })),
  totals: Schema.Record(Schema.String, Schema.Finite),
})
export type LedgerJsonView = typeof LedgerJsonView.Type
