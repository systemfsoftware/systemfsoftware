import { Schema } from 'effect'
import { LedgerEntry } from './Entry.schema.js'

export const Ledger = Schema.Struct({
  scannedChannels: Schema.Array(Schema.String),
  fileCount: Schema.Int,
  totals: Schema.Record(Schema.String, Schema.Int),
  statusTotals: Schema.Record(Schema.String, Schema.Int),
  entries: Schema.Array(LedgerEntry),
})
export type Ledger = typeof Ledger.Type
