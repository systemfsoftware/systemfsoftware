import { Array as Arr, Order } from 'effect'
import { classify, type JoinIndex } from './classify.js'
import { type Entry, type EntryKind, type LedgerEntry } from './Entry.schema.js'
import { Ledger } from './Ledger.schema.js'

export const KIND_ORDER: ReadonlyArray<EntryKind> = [
  'InlineDirective',
  'RustAttribute',
  'SkippedTest',
  'Marker',
  'ConfigSeverity',
  'PresetNarrowing',
  'Grant',
  'Patch',
]

export const STATUS_ORDER: ReadonlyArray<string> = ['Declared', 'Undeclared', 'Stale']

const byId = Order.mapInput(Order.String, (entry: LedgerEntry) => entry.id)

const countOf = <A>(
  items: ReadonlyArray<A>,
  keyOf: (item: A) => string,
  keys: ReadonlyArray<string>,
): Record<string, number> =>
  Object.fromEntries(keys.map((key) => [key, Arr.filter(items, (item) => keyOf(item) === key).length]))

export interface AssembleInput {
  readonly entries: ReadonlyArray<Entry>
  readonly index: JoinIndex
  readonly channels: ReadonlyArray<string>
  readonly fileCount: number
}

export const assembleLedger = (input: AssembleInput): Ledger => {
  const ledgerEntries = Arr.map(input.entries, (entry) => ({
    id: JSON.stringify(entry),
    entry,
    status: classify(entry, input.index),
  }))
  const sorted = Arr.sort(ledgerEntries, byId)
  return Ledger.make({
    scannedChannels: [...input.channels].sort(),
    fileCount: input.fileCount,
    totals: countOf(sorted, (item) => item.entry._tag, KIND_ORDER),
    statusTotals: countOf(sorted, (item) => item.status._tag, STATUS_ORDER),
    entries: sorted,
  })
}
