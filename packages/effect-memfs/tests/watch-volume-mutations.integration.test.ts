import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { type Cause, Effect, Queue, type Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
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

Feature('Watching a directory for mutations the driver actually made')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenario }) => {
    scenario(
      'Creating a file inside a watched directory reports that path',
      Gherkin.Do.pipe(
        Given('a watched directory')(
          'fs',
          () => Effect.tap(filesystem, (fs) => fs.makeDirectory('/watched', { recursive: true })),
        ),
        When('a file is created inside it')('event', (s) =>
          Effect.scoped(Effect.gen(function*() {
            const events = yield* subscribed(s.fs.watch('/watched'))
            yield* s.fs.writeFile('/watched/a.txt', encode('a'))
            return yield* Queue.take(events)
          }))),
        Then('the watcher reports the created path')((s) => {
          expect(s.event.path).toBe('a.txt')
        }),
      ),
    )

    scenario(
      'A file removed from a watched directory is reported as removed',
      Gherkin.Do.pipe(
        Given('a watched directory holding one file')('fs', () =>
          Effect.tap(filesystem, (fs) =>
            Effect.flatMap(
              fs.makeDirectory('/removing', { recursive: true }),
              () => fs.writeFile('/removing/gone.txt', encode('gone')),
            ))),
        When('the file is removed')('event', (s) =>
          Effect.scoped(Effect.gen(function*() {
            const events = yield* subscribed(s.fs.watch('/removing'))
            yield* s.fs.remove('/removing/gone.txt')
            return yield* Queue.take(events)
          }))),
        Then('the watcher reports the path as removed')((s) => {
          expect(s.event).toEqual({ _tag: 'Remove', path: 'gone.txt' })
        }),
      ),
    )

    scenario(
      'Closing the watching scope releases the watcher',
      Gherkin.Do.pipe(
        Given('a watched directory')(
          'fs',
          () => Effect.tap(filesystem, (fs) => fs.makeDirectory('/closing', { recursive: true })),
        ),
        When('the scope closes and the directory changes again')('entries', (s) =>
          Effect.gen(function*() {
            yield* Effect.scoped(Effect.gen(function*() {
              const events = yield* subscribed(s.fs.watch('/closing'))
              yield* s.fs.writeFile('/closing/first.txt', encode('1'))
              return yield* Queue.take(events)
            }))
            yield* s.fs.writeFile('/closing/second.txt', encode('2'))
            return yield* s.fs.readDirectory('/closing')
          })),
        Then('the later mutation still lands on the volume')((s) => {
          expect(s.entries).toContain('second.txt')
        }),
      ),
    )
  })
