import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CacheReadResult, Hit, Invalid, Miss } from './cache-store.schema.js'
import { entryOfWireBytes, EntryWireBytes } from './entry.schema.js'

/** What a store found at a digest, before anything is decoded. */
export const StoredBytes = Schema.Union([
  Schema.TaggedStruct('Absent', {}),
  Schema.TaggedStruct('Unreadable', { message: Schema.String }),
  Schema.TaggedStruct('Found', { bytes: Schema.Uint8Array }),
])
export type StoredBytes = typeof StoredBytes.Type

export class ClassifyStoredEntry extends Schema.TaggedClass<ClassifyStoredEntry>()('ClassifyStoredEntry', {
  found: StoredBytes,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const OVERSIZED = 'the stored entry is larger than 1 MiB (1,048,576 bytes)'

const isWithinCap = Schema.is(EntryWireBytes)

const decodedOf = (bytes: EntryWireBytes): CacheReadResult =>
  Result.match(entryOfWireBytes(bytes), {
    onFailure: (message): CacheReadResult => new Invalid({ reason: 'not-trace-1', message }),
    onSuccess: (entry): CacheReadResult => new Hit({ entry }),
  })

const foundOf = (bytes: Uint8Array): CacheReadResult =>
  Match.value(isWithinCap(bytes)).pipe(
    Match.when(true, () => decodedOf(bytes)),
    Match.when(false, (): CacheReadResult => new Invalid({ reason: 'oversized', message: OVERSIZED })),
    Match.exhaustive,
  )

const decide = (command: ClassifyStoredEntry): Result.Result<CacheReadResult, never> =>
  Result.succeed(
    Match.valueTags(command.found, {
      Absent: (): CacheReadResult => new Miss({}),
      Unreadable: ({ message }): CacheReadResult => new Invalid({ reason: 'unreadable', message }),
      Found: ({ bytes }) => foundOf(bytes),
    }),
  )

export const classifyStoredEntry = Workflow.make({
  command: ClassifyStoredEntry,
  decision: CacheReadResult,
  error: Schema.Never,
  decide,
})
