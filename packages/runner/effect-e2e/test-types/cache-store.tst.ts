import type * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

import type {
  CacheDeleteResult,
  CacheReadResult,
  CacheStorageFailed,
  CacheStoreShape,
  CacheWriteResult,
  KeyDigest,
  StoreMode,
} from '../src/cache/mod.js'
import type { CacheMode } from '../src/Config/config.schema.js'

describe('CacheStore', () => {
  it('cannot be served by a shape missing an operation', () => {
    expect<CacheStoreShape>().type.not.toBeAssignableFrom<Omit<CacheStoreShape, 'delete'>>()
  })

  it('reads without ever failing', () => {
    expect<CacheStoreShape['read']>().type.not.toBeAssignableFrom<
      (digest: KeyDigest) => Effect.Effect<CacheReadResult, CacheStorageFailed>
    >()
  })

  it('never answers a delete with a write result', () => {
    expect<CacheStoreShape['delete']>().type.not.toBeAssignableFrom<
      (digest: KeyDigest) => Effect.Effect<CacheWriteResult>
    >()
    expect<CacheStoreShape['delete']>().type.toBeAssignableFrom<
      (digest: KeyDigest) => Effect.Effect<CacheDeleteResult>
    >()
  })
})

describe('StoreMode', () => {
  it('is a cache mode that opens a store, never off', () => {
    expect<CacheMode>().type.toBeAssignableFrom<StoreMode>()
    expect<StoreMode>().type.not.toBeAssignableFrom<'off'>()
  })
})
