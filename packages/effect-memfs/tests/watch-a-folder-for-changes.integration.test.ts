import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type Cause, Effect, Fiber, Option, Queue, type Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'

const Feature = makeFeature({ it })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const filesystem = Effect.service(FileSystem.FileSystem)

type Reports = Queue.Dequeue<FileSystem.WatchEvent, Error.PlatformError | Cause.Done>

const watching = (
  target: string,
  recursive: boolean,
): Effect.Effect<Reports, never, MemoryFileSystem.Watcher | Scope.Scope> =>
  Effect.service(MemoryFileSystem.Watcher).pipe(
    Effect.flatMap((watcher) => watcher.start(target, { recursive })),
    Effect.flatMap((events) => Stream.toQueue(events, { capacity: 'unbounded' })),
  )

const openWatches = Effect.flatMap(Effect.service(MemoryFileSystem.Watcher), (watcher) => watcher.openWatches)

const untilListedAsWatched = (target: string) =>
  Effect.flatMap(Effect.service(MemoryFileSystem.Watcher), (watcher) => watcher.awaitOpen(target))

type Change = {
  readonly change: string
  readonly reported: string
  readonly path: string
  readonly act: (fs: FileSystem.FileSystem, folder: string) => Effect.Effect<void, Error.PlatformError>
}

const changes: ReadonlyArray<Change> = [
  {
    change: 'added',
    reported: 'Create',
    path: 'letter.txt',
    act: (fs, folder) => fs.writeFile(`${folder}/letter.txt`, encode('first')),
  },
  {
    change: 'rewritten',
    reported: 'Update',
    path: 'kept.txt',
    act: (fs, folder) => fs.writeFile(`${folder}/kept.txt`, encode('second')),
  },
  {
    change: 'deleted',
    reported: 'Remove',
    path: 'kept.txt',
    act: (fs, folder) => fs.remove(`${folder}/kept.txt`),
  },
]

type Watch = {
  readonly watched: string
  readonly folder: string
  readonly target: string
  readonly recursive: boolean
}

const folderWatches: ReadonlyArray<Watch> = [
  { watched: 'the inbox', folder: '/inbox', target: '/inbox', recursive: false },
  { watched: 'the inbox, named with a closing slash,', folder: '/inbox', target: '/inbox/', recursive: false },
  { watched: 'the inbox and everything beneath it', folder: '/inbox', target: '/inbox', recursive: true },
]

const fileWatches: ReadonlyArray<Watch> = [
  { watched: 'the kept letter in the inbox', folder: '/inbox', target: '/inbox/kept.txt', recursive: false },
  { watched: 'the kept letter at the top of the store', folder: '', target: '/kept.txt', recursive: false },
]

const watchedChanges = [
  ...folderWatches.flatMap((watch) => changes.map((change) => ({ ...watch, ...change }))),
  ...fileWatches.flatMap((watch) => changes.slice(1).map((change) => ({ ...watch, ...change }))),
]

Feature('Being told when a watched folder or letter changes')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A letter <change> while <watched> is watched is reported by name',
      watchedChanges,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the inbox and the top of the store each hold a kept letter, and ${row.watched} is being watched`)(
            'reports',
            () =>
              Effect.gen(function*() {
                const fs = yield* filesystem
                yield* fs.makeDirectory('/inbox', { recursive: true })
                yield* fs.writeFile('/inbox/kept.txt', encode('first'))
                yield* fs.writeFile('/kept.txt', encode('first'))
                return yield* watching(row.target, row.recursive)
              }),
          ),
          When(`a letter is ${row.change}`)(() => Effect.flatMap(filesystem, (fs) => row.act(fs, row.folder))),
          Then('the watcher is told which letter changed and how')((s, expect) =>
            Effect.map(Queue.take(s.reports), (event) => expect(event).toEqual({ _tag: row.reported, path: row.path }))
          ),
        ),
    )

    scenario(
      'A watch that has finished is never told about later changes',
      Gherkin.Do.pipe(
        Given('an inbox whose first watcher stopped before a second letter arrived, and a new watcher on it')(
          'reports',
          () =>
            Effect.gen(function*() {
              const fs = yield* filesystem
              yield* fs.makeDirectory('/inbox', { recursive: true })
              yield* Effect.scoped(Effect.gen(function*() {
                const reports = yield* watching('/inbox', false)
                yield* fs.writeFile('/inbox/first.txt', encode('1'))
                return yield* Queue.take(reports)
              }))
              yield* fs.writeFile('/inbox/second.txt', encode('2'))
              return yield* watching('/inbox', false)
            }),
        ),
        When('a third letter arrives')(() =>
          Effect.flatMap(filesystem, (fs) => fs.writeFile('/inbox/third.txt', encode('3')))
        ),
        Then('the new watcher hears only about the third letter')((s, expect) =>
          Effect.map(Queue.take(s.reports), (event) => expect(event).toEqual({ _tag: 'Create', path: 'third.txt' }))
        ),
      ),
    )

    scenario(
      'Code that watches through the plain filesystem hears a letter written once its watch is listed as open',
      Gherkin.Do.pipe(
        Given('an inbox that a helper watches through the plain filesystem, and the store lists the inbox as watched')(
          'helper',
          () =>
            Effect.gen(function*() {
              const fs = yield* filesystem
              yield* fs.makeDirectory('/inbox', { recursive: true })
              const helper = yield* Effect.forkScoped(Stream.runHead(fs.watch('/inbox')))
              yield* untilListedAsWatched('/inbox')
              return helper
            }),
        ),
        When('a letter arrives in the inbox')(
          'heard',
          (s) =>
            Effect.flatMap(filesystem, (fs) => fs.writeFile('/inbox/letter.txt', encode('1'))).pipe(
              Effect.andThen(Fiber.join(s.helper)),
            ),
        ),
        Then('the helper hears about the new letter, and the store lists no open watch once it has stopped')((
          s,
          expect,
        ) =>
          Effect.map(openWatches, (open) =>
            expect({ heard: s.heard, open }).toEqual({
              heard: Option.some({ _tag: 'Create', path: 'letter.txt' }),
              open: [],
            }))
        ),
      ),
    )

    scenario(
      'Only a watch that is still running is listed as open',
      Gherkin.Do.pipe(
        Given("Ada is watching the inbox, and Bo's watch on the archive has already stopped")(
          'adasWatch',
          () =>
            Effect.gen(function*() {
              const fs = yield* filesystem
              yield* fs.makeDirectory('/inbox', { recursive: true })
              yield* fs.makeDirectory('/archive', { recursive: true })
              yield* Effect.scoped(watching('/archive', false))
              return yield* watching('/inbox', false)
            }),
        ),
        When('someone asks which watches are open')('open', () => openWatches),
        Then('only the inbox is listed')((s, expect) => expect(s.open).toEqual(['/inbox'])),
      ),
    )
  })
