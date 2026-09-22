import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type Cause, Effect, Queue, type Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'
import { expect } from 'vitest'

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
  readonly seeded: boolean
  readonly act: (fs: FileSystem.FileSystem) => Effect.Effect<void, Error.PlatformError>
}

const changes: ReadonlyArray<Change> = [
  {
    change: 'added to',
    reported: 'Create',
    seeded: false,
    act: (fs) => fs.writeFile('/inbox/letter.txt', encode('first')),
  },
  {
    change: 'rewritten in',
    reported: 'Update',
    seeded: true,
    act: (fs) => fs.writeFile('/inbox/letter.txt', encode('second')),
  },
  {
    change: 'deleted from',
    reported: 'Remove',
    seeded: true,
    act: (fs) => fs.remove('/inbox/letter.txt'),
  },
]

Feature('Being told when a watched folder changes')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A letter <change> a watched folder is reported by name',
      changes,
      (row) =>
        Gherkin.Do.pipe(
          Given('an inbox folder someone is watching')('fs', () =>
            Effect.tap(filesystem, (fs) =>
              Effect.flatMap(
                fs.makeDirectory('/inbox', { recursive: true }),
                () => row.seeded ? fs.writeFile('/inbox/letter.txt', encode('first')) : Effect.void,
              ))),
          When('the letter is changed while the folder is watched')('event', (s) =>
            Effect.scoped(Effect.gen(function*() {
              const reports = yield* subscribed(s.fs.watch('/inbox'))
              yield* row.act(s.fs)
              return yield* Queue.take(reports)
            }))),
          Then('the watcher is told which letter changed and how')((s) => {
            expect(s.event).toEqual({ _tag: row.reported, path: 'letter.txt' })
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
