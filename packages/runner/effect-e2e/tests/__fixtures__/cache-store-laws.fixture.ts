import * as NodeServices from '@effect/platform-node/NodeServices'
import {
  CacheDeleteResult,
  type CacheReadResult,
  type CacheStorageFailed,
  type CacheStoreShape,
  CacheWriteResult,
  FileCacheStore,
  type KeyDigest,
  MemoryCacheStore,
  type StoreMode,
} from '@systemfsoftware/effect-e2e/cache'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import type * as Scope from 'effect/Scope'

import {
  D1,
  D2,
  E1,
  E2,
  E3,
  type EntryFixture,
  entryNameOf,
  entryOf,
  EXACT_CAP,
  FOREIGN_SCHEMA,
  NOT_JSON,
  OVER_CAP,
} from './trace-entries.fixture.js'

export interface StoreOpening {
  readonly mode: StoreMode
  readonly seed: ReadonlyMap<KeyDigest, Uint8Array>
}

export type OpenStore = (opening: StoreOpening) => Effect.Effect<CacheStoreShape, never, Scope.Scope>

export interface StoreSubject {
  readonly name: string
  readonly open: OpenStore
}

export interface LawVerdict {
  readonly law: string
  readonly expected: string
  readonly observed: string
}

interface Law {
  readonly name: string
  readonly run: (
    open: OpenStore,
  ) => Effect.Effect<
    { readonly expected: ReadonlyArray<string>; readonly observed: ReadonlyArray<string> },
    never,
    Scope.Scope
  >
}

const NO_SEED: ReadonlyMap<KeyDigest, Uint8Array> = new Map()

const readWrite = (seed = NO_SEED): StoreOpening => ({ mode: 'read-write', seed })

const readOnly = (seed = NO_SEED): StoreOpening => ({ mode: 'read-only', seed })

const seeded = (...held: ReadonlyArray<readonly [KeyDigest, Uint8Array]>): ReadonlyMap<KeyDigest, Uint8Array> =>
  new Map(held)

export const readLabel = (read: CacheReadResult): string =>
  Match.valueTags(read, {
    Hit: ({ entry }) => `Hit(${entryNameOf(entry)})`,
    Miss: () => 'Miss',
    Invalid: ({ reason }) => `Invalid(${reason})`,
  })

const failed = (failure: CacheStorageFailed): string => `CacheStorageFailed(${failure.message})`

export const writeLabel = (write: Effect.Effect<CacheWriteResult, CacheStorageFailed>): Effect.Effect<string> =>
  Effect.match(write, {
    onFailure: failed,
    onSuccess: CacheWriteResult.match({
      Written: () => 'Written',
      ReadOnly: () => 'ReadOnly',
      Oversized: () => 'Oversized',
    }),
  })

export const deleteLabel = (removal: Effect.Effect<CacheDeleteResult, CacheStorageFailed>): Effect.Effect<string> =>
  Effect.match(removal, {
    onFailure: failed,
    onSuccess: CacheDeleteResult.match({ Deleted: () => 'Deleted', ReadOnly: () => 'ReadOnly' }),
  })

const writeOf = (store: CacheStoreShape, digest: KeyDigest, fixture: EntryFixture): Effect.Effect<string> =>
  Effect.flatMap(entryOf(fixture), (entry) => writeLabel(store.write(digest, entry)))

const readOf = (store: CacheStoreShape, digest: KeyDigest): Effect.Effect<string> =>
  Effect.map(store.read(digest), readLabel)

const TORN_ROUNDS = 32

const REPLAYABLE = ['Hit(E1)', 'Hit(E3)']

const racingHistory = (store: CacheStoreShape): ReadonlyArray<Effect.Effect<string>> =>
  Arr.makeBy(TORN_ROUNDS, (round) => [writeOf(store, D1, round % 2 === 0 ? E3 : E1), readOf(store, D1)]).flat()

const laws: ReadonlyArray<Law> = [
  {
    name: 'miss-when-absent',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite())
        return { expected: ['Miss'], observed: [yield* readOf(store, D1)] }
      }),
  },
  {
    name: 'read-after-write',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite())
        const observed = [yield* writeOf(store, D1, E1), yield* readOf(store, D1), yield* readOf(store, D1)]
        return { expected: ['Written', 'Hit(E1)', 'Hit(E1)'], observed }
      }),
  },
  {
    name: 'last-write-wins',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite())
        const observed = [yield* writeOf(store, D1, E1), yield* writeOf(store, D1, E2), yield* readOf(store, D1)]
        return { expected: ['Written', 'Written', 'Hit(E2)'], observed }
      }),
  },
  {
    name: 'keys-commute',
    run: (open) =>
      Effect.gen(function*() {
        const forward = yield* open(readWrite())
        yield* writeOf(forward, D1, E1)
        yield* writeOf(forward, D2, E2)
        const backward = yield* open(readWrite())
        yield* writeOf(backward, D2, E2)
        yield* writeOf(backward, D1, E1)
        const observed = [
          yield* readOf(forward, D1),
          yield* readOf(forward, D2),
          yield* readOf(backward, D1),
          yield* readOf(backward, D2),
        ]
        return { expected: ['Hit(E1)', 'Hit(E2)', 'Hit(E1)', 'Hit(E2)'], observed }
      }),
  },
  {
    name: 'delete-then-miss',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite())
        const observed = [
          yield* writeOf(store, D1, E1),
          yield* deleteLabel(store.delete(D1)),
          yield* readOf(store, D1),
          yield* deleteLabel(store.delete(D1)),
        ]
        return { expected: ['Written', 'Deleted', 'Miss', 'Deleted'], observed }
      }),
  },
  {
    name: 'invalid-bytes',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite(seeded([D1, NOT_JSON])))
        return { expected: ['Invalid(not-trace-1)'], observed: [yield* readOf(store, D1)] }
      }),
  },
  {
    name: 'invalid-foreign-schema',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite(seeded([D1, FOREIGN_SCHEMA])))
        return { expected: ['Invalid(not-trace-1)'], observed: [yield* readOf(store, D1)] }
      }),
  },
  {
    name: 'cap-boundary-read',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite(seeded([D1, EXACT_CAP.bytes], [D2, OVER_CAP.bytes])))
        const observed = [yield* readOf(store, D1), yield* readOf(store, D2)]
        return { expected: ['Hit(exact-cap)', 'Invalid(oversized)'], observed }
      }),
  },
  {
    name: 'cap-refuses-write',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite(seeded([D1, E1.bytes])))
        const observed = [yield* writeOf(store, D1, OVER_CAP), yield* readOf(store, D1)]
        return { expected: ['Oversized', 'Hit(E1)'], observed }
      }),
  },
  {
    name: 'read-only-refuses',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readOnly(seeded([D1, E1.bytes])))
        const observed = [
          String(store.writable),
          yield* writeOf(store, D1, E2),
          yield* writeOf(store, D2, E2),
          yield* deleteLabel(store.delete(D1)),
          yield* readOf(store, D1),
          yield* readOf(store, D2),
        ]
        return { expected: ['false', 'ReadOnly', 'ReadOnly', 'ReadOnly', 'Hit(E1)', 'Miss'], observed }
      }),
  },
  {
    name: 'writable-when-read-write',
    run: (open) =>
      Effect.map(open(readWrite()), (store) => ({ expected: ['true'], observed: [String(store.writable)] })),
  },
  {
    name: 'no-torn-entry',
    run: (open) =>
      Effect.gen(function*() {
        const store = yield* open(readWrite(seeded([D1, E1.bytes])))
        const raced = yield* Effect.all(racingHistory(store), { concurrency: 'unbounded' })
        const stray = Arr.dedupe(raced.filter((label) => label !== 'Written' && !REPLAYABLE.includes(label)))
        const settled = yield* readOf(store, D1)
        return {
          expected: ['stray: none', 'settled: replayable'],
          observed: [
            `stray: ${stray.length === 0 ? 'none' : stray.join(' | ')}`,
            `settled: ${REPLAYABLE.includes(settled) ? 'replayable' : settled}`,
          ],
        }
      }),
  },
]

export const LAW_NAMES: ReadonlyArray<string> = laws.map((law) => law.name)

const verdictOf = (subject: StoreSubject) => (law: Law): Effect.Effect<LawVerdict> =>
  Effect.scoped(law.run(subject.open)).pipe(
    Effect.map(({ expected, observed }) => ({
      law: law.name,
      expected: JSON.stringify(expected),
      observed: JSON.stringify(observed),
    })),
    Effect.catchCause((cause) =>
      Effect.succeed({ law: law.name, expected: 'the law to run without a defect', observed: Cause.pretty(cause) })
    ),
  )

export const proveCacheStore = (subject: StoreSubject): Effect.Effect<ReadonlyArray<LawVerdict>> =>
  Effect.forEach(laws, verdictOf(subject))

export const brokenLawsOf = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.filter((verdict) => verdict.expected !== verdict.observed).map((verdict) => verdict.law)

export const memorySubject: StoreSubject = {
  name: 'memory',
  open: (opening) => MemoryCacheStore.make(opening),
}

const seedFiles = (fs: FileSystem.FileSystem, path: Path.Path, directory: string, opening: StoreOpening) =>
  Effect.forEach(
    [...opening.seed],
    ([digest, bytes]) =>
      fs.makeDirectory(directory, { recursive: true }).pipe(
        Effect.andThen(fs.writeFile(path.join(directory, `${digest}.json`), bytes)),
      ),
    { discard: true },
  )

export const fileSubject: StoreSubject = {
  name: 'file',
  open: (opening) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-cache-' })
      const directory = path.join(root, '.e2e', 'cache')
      yield* seedFiles(fs, path, directory, opening)
      return yield* FileCacheStore.make({ directory, mode: opening.mode })
    }).pipe(Effect.orDie, Effect.provide(NodeServices.layer)),
}
