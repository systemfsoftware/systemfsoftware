import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Random from 'effect/Random'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { AdmitEntryDelete, admitEntryDelete } from './admit-entry-delete.workflow.js'
import { AdmitEntryWrite, admitEntryWrite } from './admit-entry-write.workflow.js'
import {
  type CacheDeleteResult,
  type CacheReadResult,
  CacheStorageFailed,
  type CacheWriteResult,
  type StoreMode,
} from './cache-store.schema.js'
import { CacheStore } from './cache-store.service.js'
import { ClassifyStoredEntry, classifyStoredEntry, type StoredBytes } from './classify-stored-entry.workflow.js'
import { EntryWireBytes, type TraceEntry } from './entry.schema.js'
import type { KeyDigest } from './key.schema.js'

export interface FileCacheStoreOptions {
  readonly directory: string
  readonly mode: StoreMode
}

const ENTRY_FILE_MODE = 0o600

const isWithinCap = Schema.is(EntryWireBytes)

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const appended = (held: Uint8Array, chunk: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(held.length + chunk.length)
  joined.set(held)
  joined.set(chunk, held.length)
  return joined
}

const storedOnFailure = (error: PlatformError): StoredBytes =>
  Match.value(error.reason).pipe(
    Match.when({ _tag: 'NotFound' }, (): StoredBytes => ({ _tag: 'Absent' })),
    Match.orElse((): StoredBytes => ({ _tag: 'Unreadable', message: error.message })),
  )

const absentIsRemoved = (error: PlatformError): Effect.Effect<void, PlatformError> =>
  Match.value(error.reason).pipe(
    Match.when({ _tag: 'NotFound' }, () => Effect.void),
    Match.orElse(() => Effect.fail(error)),
  )

const storageFailed = (error: PlatformError): CacheStorageFailed => new CacheStorageFailed({ message: error.message })

export const make = (
  options: FileCacheStoreOptions,
): Effect.Effect<CacheStore['Service'], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entryPathOf = (digest: KeyDigest): string => path.join(options.directory, `${digest}.json`)

    const storedAt = (digest: KeyDigest): Effect.Effect<StoredBytes> =>
      fs.stream(entryPathOf(digest)).pipe(
        Stream.scan(() => new Uint8Array(), appended),
        Stream.takeUntil((held) => !isWithinCap(held)),
        Stream.runLast,
        Effect.map((held): StoredBytes => ({ _tag: 'Found', bytes: Option.getOrElse(held, () => new Uint8Array()) })),
        Effect.catchTag('PlatformError', (error) => error.pipe(storedOnFailure, Effect.succeed)),
      )

    const replaceAtomically = (digest: KeyDigest, bytes: Uint8Array): Effect.Effect<void, PlatformError> =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(options.directory, { recursive: true })
        const nonce = yield* Random.nextInt
        const temporary = path.join(options.directory, `.${digest}.${nonce.toString(36)}.tmp`)
        yield* fs.writeFile(temporary, bytes, { flag: 'wx', mode: ENTRY_FILE_MODE }).pipe(
          Effect.andThen(fs.rename(temporary, entryPathOf(digest))),
          Effect.onError(() => Effect.ignore(fs.remove(temporary))),
        )
      })

    const read = (digest: KeyDigest): Effect.Effect<CacheReadResult> =>
      Effect.map(storedAt(digest), (found) => decided(classifyStoredEntry(new ClassifyStoredEntry({ found }))))

    const write = (digest: KeyDigest, entry: TraceEntry): Effect.Effect<CacheWriteResult, CacheStorageFailed> =>
      Match.valueTags(decided(admitEntryWrite(new AdmitEntryWrite({ mode: options.mode, entry }))), {
        WriteAdmitted: ({ bytes }): Effect.Effect<CacheWriteResult, CacheStorageFailed> =>
          replaceAtomically(digest, bytes).pipe(Effect.mapError(storageFailed), Effect.as({ _tag: 'Written' })),
        WriteRefused: ({ answer }): Effect.Effect<CacheWriteResult, CacheStorageFailed> => Effect.succeed(answer),
      })

    const remove = (digest: KeyDigest): Effect.Effect<CacheDeleteResult, CacheStorageFailed> =>
      Match.valueTags(decided(admitEntryDelete(new AdmitEntryDelete({ mode: options.mode }))), {
        DeleteAdmitted: (): Effect.Effect<CacheDeleteResult, CacheStorageFailed> =>
          fs.remove(entryPathOf(digest)).pipe(
            Effect.catchTag('PlatformError', absentIsRemoved),
            Effect.mapError(storageFailed),
            Effect.as({ _tag: 'Deleted' }),
          ),
        DeleteRefused: (): Effect.Effect<CacheDeleteResult, CacheStorageFailed> => Effect.succeed({ _tag: 'ReadOnly' }),
      })

    return CacheStore.of({ writable: options.mode === 'read-write', read, write, delete: remove })
  })

export const layer = (
  options: FileCacheStoreOptions,
): Layer.Layer<CacheStore, never, FileSystem.FileSystem | Path.Path> => Layer.effect(CacheStore)(make(options))
