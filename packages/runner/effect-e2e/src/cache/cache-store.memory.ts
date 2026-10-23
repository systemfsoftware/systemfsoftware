import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'

import { AdmitEntryDelete, admitEntryDelete } from './admit-entry-delete.workflow.js'
import { AdmitEntryWrite, admitEntryWrite } from './admit-entry-write.workflow.js'
import type { CacheDeleteResult, CacheWriteResult, StoreMode } from './cache-store.schema.js'
import { CacheStore } from './cache-store.service.js'
import { ClassifyStoredEntry, classifyStoredEntry, type StoredBytes } from './classify-stored-entry.workflow.js'
import type { TraceEntry } from './entry.schema.js'
import type { KeyDigest } from './key.schema.js'

export interface MemoryCacheStoreOptions {
  readonly mode: StoreMode
  readonly seed?: ReadonlyMap<KeyDigest, Uint8Array> | undefined
}

type Held = HashMap.HashMap<KeyDigest, Uint8Array>

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const storedAt = (held: Held, digest: KeyDigest): StoredBytes =>
  Option.match(HashMap.get(held, digest), {
    onNone: (): StoredBytes => ({ _tag: 'Absent' }),
    onSome: (bytes): StoredBytes => ({ _tag: 'Found', bytes }),
  })

const writeTo = (entries: Ref.Ref<Held>, mode: StoreMode) =>
(
  digest: KeyDigest,
  entry: TraceEntry,
): Effect.Effect<CacheWriteResult> =>
  Match.valueTags(decided(admitEntryWrite(new AdmitEntryWrite({ mode, entry }))), {
    WriteAdmitted: ({ bytes }): Effect.Effect<CacheWriteResult> =>
      Effect.as(Ref.update(entries, HashMap.set(digest, bytes)), { _tag: 'Written' }),
    WriteRefused: ({ answer }): Effect.Effect<CacheWriteResult> => Effect.succeed(answer),
  })

const deleteFrom = (entries: Ref.Ref<Held>, mode: StoreMode) => (digest: KeyDigest): Effect.Effect<CacheDeleteResult> =>
  Match.valueTags(decided(admitEntryDelete(new AdmitEntryDelete({ mode }))), {
    DeleteAdmitted: (): Effect.Effect<CacheDeleteResult> =>
      Effect.as(Ref.update(entries, HashMap.remove(digest)), { _tag: 'Deleted' }),
    DeleteRefused: (): Effect.Effect<CacheDeleteResult> => Effect.succeed({ _tag: 'ReadOnly' }),
  })

export const make = (options: MemoryCacheStoreOptions): Effect.Effect<CacheStore['Service']> =>
  Effect.map(Ref.make<Held>(HashMap.fromIterable(options.seed ?? [])), (entries) =>
    CacheStore.of({
      writable: options.mode === 'read-write',
      read: (digest) =>
        Effect.map(
          Ref.get(entries),
          (held) => decided(classifyStoredEntry(new ClassifyStoredEntry({ found: storedAt(held, digest) }))),
        ),
      write: writeTo(entries, options.mode),
      delete: deleteFrom(entries, options.mode),
    }))

export const layer = (options: MemoryCacheStoreOptions): Layer.Layer<CacheStore> =>
  Layer.effect(CacheStore)(make(options))
