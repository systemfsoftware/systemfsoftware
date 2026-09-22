import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const withNotes = MemoryFileSystem.make({ '/notes/hello.txt': 'hello' })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

Feature('Reading and writing an open file from a position that moves')
  .withScenarioLayer(withNotes.layer)
  .body(({ scenario }) => {
    scenario(
      'Text written to a new file reads back once the reader returns to the beginning',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('a note is written, the reader returns to the beginning, and the note is read')(
          'contents',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const note = yield* s.fs.open('/notes/draft.txt', { flag: 'w+' })
              yield* note.writeAll(encode('abcdef'))
              yield* note.seek(0n, 'start')
              return yield* note.readAlloc(6)
            })),
        ),
        Then('every letter that was written comes back')((s) => {
          expect(Option.map(s.contents, decode)).toEqual(Option.some('abcdef'))
        }),
      ),
    )

    scenario(
      'Shortening a file sends the next write to the new end',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('a note is shortened to two letters and one more letter is written')(
          'contents',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const note = yield* s.fs.open('/notes/draft.txt', { flag: 'w+' })
              yield* note.writeAll(encode('abcdef'))
              yield* note.truncate(2)
              yield* note.writeAll(encode('Z'))
              return yield* s.fs.readFile('/notes/draft.txt')
            })),
        ),
        Then('the new letter sits directly after the two that were kept')((s) => {
          expect(decode(s.contents)).toBe('abZ')
        }),
      ),
    )

    scenario(
      'Reading onward from the end of a file returns nothing',
      Gherkin.Do.pipe(
        Given('a filesystem holding a note of five letters')('fs', () => filesystem),
        When('the reader moves past the last letter and reads on')(
          'contents',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const note = yield* s.fs.open('/notes/hello.txt', { flag: 'r' })
              yield* note.seek(5n, 'start')
              return yield* note.readAlloc(4)
            })),
        ),
        Then('nothing is handed back')((s) => {
          expect(s.contents).toEqual(Option.none())
        }),
      ),
    )

    scenario(
      'Moving back past the start of a file is turned down and the reader stays put',
      Gherkin.Do.pipe(
        Given('a filesystem holding a note of five letters')('fs', () => filesystem),
        When('the reader is asked to move to a position before the first letter')(
          'outcome',
          (s) =>
            Effect.scoped(Effect.gen(function*() {
              const note = yield* s.fs.open('/notes/hello.txt', { flag: 'r' })
              const refusal = yield* Effect.flip(note.seek(-1n, 'start'))
              const position = yield* note.seek(0n, 'current')
              return { refusal, position }
            })),
        ),
        Then('the move is turned down and the reader is still at the first letter')((s) => {
          expect(s.outcome.refusal.reason._tag).toBe('BadArgument')
          expect(s.outcome.position).toBe(0n)
        }),
      ),
    )
  })
