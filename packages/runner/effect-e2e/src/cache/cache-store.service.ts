import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { CacheDeleteResult, CacheReadResult, CacheStorageFailed, CacheWriteResult } from './cache-store.schema.js'
import type { TraceEntry } from './entry.schema.js'
import type { KeyDigest } from './key.schema.js'

export interface CacheStoreShape {
  /** False for a read-only store, whose writes and deletes are refused. */
  readonly writable: boolean
  /** Never fails: an entry that cannot be replayed is `Invalid`, which the runner treats as a miss. */
  readonly read: (digest: KeyDigest) => Effect.Effect<CacheReadResult>
  readonly write: (digest: KeyDigest, entry: TraceEntry) => Effect.Effect<CacheWriteResult, CacheStorageFailed>
  readonly delete: (digest: KeyDigest) => Effect.Effect<CacheDeleteResult, CacheStorageFailed>
}

export class CacheStore extends Context.Service<CacheStore, CacheStoreShape>()(
  '@systemfsoftware/effect-e2e/CacheStore',
) {}
