import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const seeded = MemoryFileSystem.make({ '/seed/hello.txt': 'hello' })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

Feature('Moving the cursor of an open file')
  .withScenarioLayer(seeded.layer)
  .body(({ scenario }) => {
    scenario(
      'Writing then rewinding reads back the whole file',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('bytes are written, the cursor rewound, and the file read')(
          'read',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const file = yield* s.fs.open('/cursor.txt', { flag: 'w+' })
              yield* file.writeAll(encode('abcdef'))
              yield* file.seek(0n, 'start')
              return yield* file.readAlloc(6)
            })),
        ),
        Then('every written byte is returned')((s) => {
          expect(Option.map(s.read, decode)).toEqual(Option.some('abcdef'))
        }),
      ),
    )

    scenario(
      'Truncating pulls the cursor back to the new end',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('a written file is truncated and written again')('contents', (s) =>
          Effect.scoped(Effect.gen(function*() {
            const file = yield* s.fs.open('/clamp.txt', { flag: 'w+' })
            yield* file.writeAll(encode('abcdef'))
            yield* file.truncate(2)
            yield* file.writeAll(encode('Z'))
            return yield* s.fs.readFile('/clamp.txt')
          }))),
        Then('the second write lands at the truncated end')((s) => {
          expect(decode(s.contents)).toBe('abZ')
        }),
      ),
    )

    scenario(
      'Reading past the end yields no slice',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('the cursor is placed at the end and a read is attempted')(
          'read',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const file = yield* s.fs.open('/seed/hello.txt', { flag: 'r' })
              yield* file.seek(5n, 'start')
              return yield* file.readAlloc(4)
            })),
        ),
        Then('nothing is read')((s) => {
          expect(s.read).toEqual(Option.none())
        }),
      ),
    )

    scenario(
      'Seeking before the start refuses and leaves the cursor untouched',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('a negative absolute seek is attempted')('outcome', (s) =>
          Effect.scoped(Effect.gen(function*() {
            const file = yield* s.fs.open('/seed/hello.txt', { flag: 'r' })
            const failure = yield* Effect.flip(file.seek(-1n, 'start'))
            const position = yield* file.seek(0n, 'current')
            return { failure, position }
          }))),
        Then('the seek is refused as a bad argument and the cursor is unmoved')((s) => {
          expect(s.outcome.failure.reason._tag).toBe('BadArgument')
          expect(s.outcome.position).toBe(0n)
        }),
      ),
    )
  })
