import * as NodeServices from '@effect/platform-node/NodeServices'
import { type CacheStoreShape, FileCacheStore, type StoreMode } from '@systemfsoftware/effect-e2e/cache'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import { brokenSubject } from './__fixtures__/broken-cache-stores.fixture.js'
import {
  brokenLawsOf,
  fileSubject,
  LAW_NAMES,
  type LawVerdict,
  memorySubject,
  proveCacheStore,
  readLabel,
  writeLabel,
} from './__fixtures__/cache-store-laws.fixture.js'
import { D1, D2, E1, entryOf } from './__fixtures__/trace-entries.fixture.js'

const Feature = makeFeature({ it })

const ENTRY_FILE_MODE = 0o600

const PERMISSION_BITS = 0o777

const outcomes = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.map((verdict) => `${verdict.law}: ${verdict.expected === verdict.observed ? 'held' : 'broken'}`)

const subjects = { memory: memorySubject, file: fileSubject } as const

interface FileStore {
  readonly directory: string
  readonly store: CacheStoreShape
}

const fileStoreIn = (mode: StoreMode) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-cache-' })
    const directory = path.join(root, '.e2e', 'cache')
    const store = yield* FileCacheStore.make({ directory, mode })
    return { directory, store } satisfies FileStore
  })

const entryFileOf = (directory: string, digest: string) =>
  Effect.map(Path.Path, (path) => path.join(directory, `${digest}.json`))

Feature('Storing replay recordings in a cache store')
  .withLayer(Layer.empty)
  .live('the file store reads and writes real files under a temporary directory')
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'The <store> store keeps every cache store law',
      [{ store: 'memory' }, { store: 'file' }] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the ${row.store} store`)('subject', () => Effect.succeed(subjects[row.store])),
          When('the cache store laws are proven against it')('verdicts', ({ subject }) => proveCacheStore(subject)),
          Then('every law holds')((s, expect) =>
            expect(outcomes(s.verdicts)).toEqual(LAW_NAMES.map((law) => `${law}: held`))
          ),
        ),
    )

    scenarioOutline(
      'A store that <broken> breaks exactly the laws over what it breaks',
      [
        { broken: 'write-drops', laws: ['read-after-write', 'last-write-wins', 'keys-commute'] },
        { broken: 'keeps-first', laws: ['last-write-wins', 'cap-refuses-write', 'read-only-refuses'] },
        { broken: 'ignores-mode', laws: ['read-only-refuses'] },
        { broken: 'no-cap', laws: ['cap-refuses-write'] },
        { broken: 'lenient-read', laws: ['invalid-bytes', 'invalid-foreign-schema', 'cap-boundary-read'] },
        { broken: 'delete-keeps', laws: ['delete-then-miss'] },
        { broken: 'torn', laws: ['no-torn-entry'] },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the memory store, broken so that it ${row.broken}`)('subject', () =>
            Effect.succeed(brokenSubject(row.broken))),
          When('the cache store laws are proven against it')('verdicts', ({ subject }) =>
            proveCacheStore(subject)),
          Then('only the laws over that behaviour are broken')((s, expect) =>
            expect(brokenLawsOf(s.verdicts)).toEqual(row.laws)
          ),
        ),
    )

    scenario(
      'A written entry is one owner-only file named for its digest',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a read-write file store over a fresh temporary directory')('opened', () => fileStoreIn('read-write')),
        When('an entry is written at a digest')('written', ({ opened }) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const answer = yield* writeLabel(Effect.flatMap(entryOf(E1), (entry) => opened.store.write(D1, entry)))
            const info = yield* Effect.orDie(fs.stat(yield* entryFileOf(opened.directory, D1)))
            const files = yield* Effect.orDie(fs.readDirectory(opened.directory))
            return { answer, permissions: info.mode & PERMISSION_BITS, files }
          })),
        Then('the write answers Written and the directory holds only that file, readable by its owner alone')((
          s,
          expect,
        ) => expect(s.written).toEqual({ answer: 'Written', permissions: ENTRY_FILE_MODE, files: [`${D1}.json`] })),
      ),
    )

    scenario(
      'An entry the store cannot read is invalid, and other digests are still served',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a file store whose entry path for one digest is a directory, and an entry stored at another')(
          'opened',
          () =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const opened = yield* fileStoreIn('read-write')
              yield* Effect.orDie(fs.makeDirectory(yield* entryFileOf(opened.directory, D1), { recursive: true }))
              yield* Effect.flatMap(entryOf(E1), (entry) => Effect.orDie(opened.store.write(D2, entry)))
              return opened
            }),
        ),
        When('both digests are read')(
          'reads',
          ({ opened }) =>
            Effect.all([Effect.map(opened.store.read(D1), readLabel), Effect.map(opened.store.read(D2), readLabel)]),
        ),
        Then('the unreadable one is invalid and the other replays')((s, expect) =>
          expect(s.reads).toEqual(['Invalid(unreadable)', 'Hit(E1)'])
        ),
      ),
    )

    scenario(
      'A read-only file store over a missing directory misses and creates nothing',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a read-only file store whose directory does not exist')('opened', () => fileStoreIn('read-only')),
        When('it is read and asked to write')('outcome', ({ opened }) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const read = readLabel(yield* opened.store.read(D1))
            const write = yield* writeLabel(Effect.flatMap(entryOf(E1), (entry) => opened.store.write(D1, entry)))
            const directoryExists = yield* Effect.orDie(fs.exists(opened.directory))
            return { read, write, directoryExists }
          })),
        Then('it misses, refuses the write, and the directory is still absent')((s, expect) =>
          expect(s.outcome).toEqual({ read: 'Miss', write: 'ReadOnly', directoryExists: false })
        ),
      ),
    )

    scenario(
      'A write the disk refuses fails with a storage failure and leaves no temporary file',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a file store whose entry path for a digest is a directory that is not empty')(
          'opened',
          () =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const path = yield* Path.Path
              const opened = yield* fileStoreIn('read-write')
              const blocked = yield* entryFileOf(opened.directory, D1)
              yield* Effect.orDie(fs.makeDirectory(blocked, { recursive: true }))
              yield* Effect.orDie(fs.writeFileString(path.join(blocked, 'occupant'), 'occupied'))
              return opened
            }),
        ),
        When('an entry is written at that digest')('outcome', ({ opened }) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const write = yield* writeLabel(Effect.flatMap(entryOf(E1), (entry) => opened.store.write(D1, entry)))
            const files = yield* Effect.orDie(fs.readDirectory(opened.directory))
            return { failed: write.startsWith('CacheStorageFailed('), files }
          })),
        Then('the write fails and only the blocking directory remains')((s, expect) =>
          expect(s.outcome).toEqual({ failed: true, files: [`${D1}.json`] })
        ),
      ),
    )
  })
