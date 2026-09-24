import { expect } from '@effect/vitest'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type Cause, Effect, Queue, type Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'

const Feature = makeFeature({ it, layer })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const filesystem = Effect.service(FileSystem.FileSystem)

const subscribed = <A, E>(
  stream: Stream.Stream<A, E>,
): Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, Scope.Scope> =>
  Effect.flatMap(
    Stream.toQueue(stream, { capacity: 'unbounded' }),
    (queue) => Effect.as(Effect.repeat(Effect.yieldNow, { times: 8 }), queue),
  )

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
          Given('an inbox and the top of the store each holding a kept letter')('fs', () =>
            Effect.tap(filesystem, (fs) =>
              Effect.gen(function*() {
                yield* fs.makeDirectory('/inbox', { recursive: true })
                yield* fs.writeFile('/inbox/kept.txt', encode('first'))
                yield* fs.writeFile('/kept.txt', encode('first'))
              }))),
          When('the letter is changed while it is watched')('event', (s) =>
            Effect.scoped(Effect.gen(function*() {
              const reports = yield* subscribed(s.fs.watch(row.target, { recursive: row.recursive }))
              yield* row.act(s.fs, row.folder)
              return yield* Queue.take(reports)
            }))),
          Then('the watcher is told which letter changed and how')((s) => {
            expect(s.event).toEqual({ _tag: row.reported, path: row.path })
          }),
        ),
    )

    scenario(
      'A watch that has finished is never told about later changes',
      Gherkin.Do.pipe(
        Given('an inbox folder that was watched only until the first letter arrived')(
          'fs',
          () =>
            Effect.tap(filesystem, (fs) =>
              Effect.gen(function*() {
                yield* fs.makeDirectory('/inbox', { recursive: true })
                yield* Effect.scoped(Effect.gen(function*() {
                  const reports = yield* subscribed(fs.watch('/inbox'))
                  yield* fs.writeFile('/inbox/first.txt', encode('1'))
                  return yield* Queue.take(reports)
                }))
              })),
        ),
        When('a second letter arrives and someone starts watching again')('event', (s) =>
          Effect.gen(function*() {
            yield* s.fs.writeFile('/inbox/second.txt', encode('2'))
            return yield* Effect.scoped(Effect.gen(function*() {
              const reports = yield* subscribed(s.fs.watch('/inbox'))
              yield* s.fs.writeFile('/inbox/third.txt', encode('3'))
              return yield* Queue.take(reports)
            }))
          })),
        Then('the new watcher hears only about the letter that arrived while it was watching')((s) => {
          expect(s.event).toEqual({ _tag: 'Create', path: 'third.txt' })
        }),
      ),
    )
  })
