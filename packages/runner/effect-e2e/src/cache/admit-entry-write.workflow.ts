import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Oversized, ReadOnly, StoreMode } from './cache-store.schema.js'
import { EntryWireBytes, entryWireUtf8Of, TraceEntry } from './entry.schema.js'

const AdmitEntryWriteTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/AdmitEntryWrite')

export class AdmitEntryWrite extends Schema.TaggedClass<AdmitEntryWrite>()('AdmitEntryWrite', {
  mode: StoreMode,
  entry: TraceEntry,
}) {
  static readonly [Workflow.InstrumentationBrand] = { mode: 'app.e2e.cache.store-mode' } as const
}

export class WriteAdmitted extends Schema.TaggedClass<WriteAdmitted>()('WriteAdmitted', { bytes: EntryWireBytes }) {
  readonly [AdmitEntryWriteTypeId] = AdmitEntryWriteTypeId
}

export class WriteRefused extends Schema.TaggedClass<WriteRefused>()('WriteRefused', {
  answer: Schema.Union([ReadOnly, Oversized]),
}) {
  readonly [AdmitEntryWriteTypeId] = AdmitEntryWriteTypeId
}

export const WriteAdmission = Schema.Union([WriteAdmitted, WriteRefused])
export type WriteAdmission = typeof WriteAdmission.Type

const isWithinCap = Schema.is(EntryWireBytes)

const sizedOf = (entry: TraceEntry): WriteAdmission =>
  Option.match(Option.filter(entryWireUtf8Of(entry), isWithinCap), {
    onNone: (): WriteAdmission => new WriteRefused({ answer: { _tag: 'Oversized' } }),
    onSome: (bytes): WriteAdmission => new WriteAdmitted({ bytes }),
  })

const decide = (command: AdmitEntryWrite): Result.Result<WriteAdmission, never> =>
  Result.succeed(
    Match.value(command.mode).pipe(
      Match.when('read-only', (): WriteAdmission => new WriteRefused({ answer: { _tag: 'ReadOnly' } })),
      Match.when('read-write', () => sizedOf(command.entry)),
      Match.exhaustive,
    ),
  )

export const admitEntryWrite = Workflow.make({
  command: AdmitEntryWrite,
  decision: WriteAdmission,
  error: Schema.Never,
  decide,
})
