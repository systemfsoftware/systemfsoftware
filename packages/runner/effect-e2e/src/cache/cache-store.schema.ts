import * as Schema from 'effect/Schema'

import { TraceEntry } from './entry.schema.js'

const CacheReadTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/CacheRead')

/** The modes a store can be opened in; a cache that is `off` opens no store. */
export const StoreMode = Schema.Literals(['read-only', 'read-write'])
export type StoreMode = typeof StoreMode.Type

/** Why a stored entry cannot be replayed; the runner treats every reason as a miss. */
export const InvalidReason = Schema.Literals(['unreadable', 'oversized', 'not-trace-1'])
export type InvalidReason = typeof InvalidReason.Type

export class Hit extends Schema.TaggedClass<Hit>()('Hit', { entry: TraceEntry }) {
  readonly [CacheReadTypeId] = CacheReadTypeId
}

export class Miss extends Schema.TaggedClass<Miss>()('Miss', {}) {
  readonly [CacheReadTypeId] = CacheReadTypeId
}

export class Invalid extends Schema.TaggedClass<Invalid>()('Invalid', {
  reason: InvalidReason,
  message: Schema.String,
}) {
  readonly [CacheReadTypeId] = CacheReadTypeId
}

export const CacheReadResult = Schema.Union([Hit, Miss, Invalid])
export type CacheReadResult = typeof CacheReadResult.Type

export const Written = Schema.TaggedStruct('Written', {})
export type Written = typeof Written.Type

export const Deleted = Schema.TaggedStruct('Deleted', {})
export type Deleted = typeof Deleted.Type

export const ReadOnly = Schema.TaggedStruct('ReadOnly', {})
export type ReadOnly = typeof ReadOnly.Type

export const Oversized = Schema.TaggedStruct('Oversized', {})
export type Oversized = typeof Oversized.Type

export const CacheWriteResult = Schema.Union([Written, ReadOnly, Oversized]).pipe(Schema.toTaggedUnion('_tag'))
export type CacheWriteResult = typeof CacheWriteResult.Type

export const CacheDeleteResult = Schema.Union([Deleted, ReadOnly]).pipe(Schema.toTaggedUnion('_tag'))
export type CacheDeleteResult = typeof CacheDeleteResult.Type

/** The store's own medium failed: the disk refused a write, a rename or a removal. */
export class CacheStorageFailed extends Schema.TaggedError<CacheStorageFailed>()('CacheStorageFailed', {
  message: Schema.String,
}) {}
