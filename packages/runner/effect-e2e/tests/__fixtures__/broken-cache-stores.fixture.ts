import {
  type CacheReadResult,
  CacheStore,
  type CacheStoreShape,
  Hit,
  type KeyDigest,
  MemoryCacheStore,
  Miss,
  type TraceEntry,
} from '@systemfsoftware/effect-e2e/cache'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { StoreOpening, StoreSubject } from './cache-store-laws.fixture.js'
import { wireBytesOf } from './trace-entries.fixture.js'

type Breakage = (opening: StoreOpening, good: CacheStoreShape) => Effect.Effect<CacheStoreShape>

const discarded = (opening: StoreOpening): Effect.Effect<CacheStoreShape> =>
  MemoryCacheStore.make({ mode: opening.mode })

const keepsFirstWrite = (good: CacheStoreShape) => (digest: KeyDigest, entry: TraceEntry) =>
  Effect.flatMap(good.read(digest), (read) =>
    Match.valueTags(read, {
      Hit: () => Effect.succeed({ _tag: 'Written' } as const),
      Miss: () => good.write(digest, entry),
      Invalid: () => good.write(digest, entry),
    }))

const lenient = (read: CacheReadResult): CacheReadResult =>
  Match.valueTags(read, { Hit: (hit): CacheReadResult => hit, Miss: (miss) => miss, Invalid: () => new Miss({}) })

const uncapped: Breakage = (_opening, good) =>
  Effect.map(Ref.make(HashMap.empty<KeyDigest, TraceEntry>()), (oversized) =>
    CacheStore.of({
      ...good,
      read: (digest) =>
        Effect.flatMap(Ref.get(oversized), (held) =>
          Option.match(HashMap.get(held, digest), {
            onNone: () => good.read(digest),
            onSome: (entry) => Effect.succeed(new Hit({ entry })),
          })),
      write: (digest, entry) =>
        Effect.flatMap(good.write(digest, entry), (answer) =>
          Match.valueTags(answer, {
            Written: () => Effect.succeed(answer),
            ReadOnly: () => Effect.succeed(answer),
            Oversized: () => Effect.as(Ref.update(oversized, HashMap.set(digest, entry)), { _tag: 'Written' } as const),
          })),
    }))

const halfWritten = (opening: StoreOpening, good: CacheStoreShape): Effect.Effect<CacheStoreShape> =>
  Effect.map(Ref.make(Option.none<readonly [KeyDigest, Uint8Array]>()), (inFlight) =>
    CacheStore.of({
      ...good,
      read: (digest) =>
        Effect.flatMap(Ref.get(inFlight), (torn) =>
          Option.match(Option.filter(torn, ([at]) => at === digest), {
            onNone: () => good.read(digest),
            onSome: ([at, bytes]) =>
              Effect.flatMap(
                MemoryCacheStore.make({ mode: opening.mode, seed: new Map([[at, bytes]]) }),
                (scratch) => scratch.read(at),
              ),
          })),
      write: (digest, entry) => {
        const bytes = wireBytesOf(entry)
        return Ref.set(inFlight, Option.some([digest, bytes.slice(0, Math.floor(bytes.length / 2))] as const)).pipe(
          Effect.andThen(Effect.yieldNow),
          Effect.andThen(Ref.set(inFlight, Option.none())),
          Effect.andThen(good.write(digest, entry)),
        )
      },
    }))

const breakages = {
  'write-drops': (opening, good) =>
    Effect.map(discarded(opening), (sink) => CacheStore.of({ ...good, write: sink.write })),
  'keeps-first': (_opening, good) => Effect.succeed(CacheStore.of({ ...good, write: keepsFirstWrite(good) })),
  'ignores-mode': (opening) => MemoryCacheStore.make({ mode: 'read-write', seed: opening.seed }),
  'no-cap': uncapped,
  'lenient-read': (_opening, good) =>
    Effect.succeed(CacheStore.of({ ...good, read: (digest) => Effect.map(good.read(digest), lenient) })),
  'delete-keeps': (opening, good) =>
    Effect.map(discarded(opening), (sink) => CacheStore.of({ ...good, delete: sink.delete })),
  torn: halfWritten,
} as const satisfies Record<string, Breakage>

export type BrokenStore = keyof typeof breakages

export const brokenSubject = (broken: BrokenStore): StoreSubject => ({
  name: `memory store that ${broken}`,
  open: (opening) => Effect.flatMap(MemoryCacheStore.make(opening), (good) => breakages[broken](opening, good)),
})
