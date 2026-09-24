import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Option, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Error from 'effect/PlatformError'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

const note = '/notes/hello.txt'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

const textOf = (fs: FileSystem.FileSystem): Effect.Effect<string, Error.PlatformError> =>
  Effect.map(fs.readFile(note), decode)

const allocated = (contents: Option.Option<Uint8Array>): string =>
  Option.match(contents, { onNone: () => 'nothing', onSome: decode })

type Work = {
  readonly work: string
  readonly seen: string
  readonly observe: (
    fs: FileSystem.FileSystem,
  ) => Effect.Effect<string, Error.PlatformError, Scope.Scope>
}

const opened = (fs: FileSystem.FileSystem, flag: FileSystem.OpenFlag) => fs.open(note, { flag })

const works: ReadonlyArray<Work> = [
  {
    work: 'writing six letters, going back to the start and reading them',
    seen: 'abcdef',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'w+')
        yield* file.writeAll(encode('abcdef'))
        yield* file.seek(0n, 'start')
        return allocated(yield* file.readAlloc(6))
      }),
  },
  {
    work: 'writing six letters, cutting it to two and writing one more',
    seen: 'abZ',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'w+')
        yield* file.writeAll(encode('abcdef'))
        yield* file.truncate(2)
        yield* file.writeAll(encode('Z'))
        return yield* textOf(fs)
      }),
  },
  {
    work: 'moving past the last letter and reading on',
    seen: 'nothing',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r')
        yield* file.seek(5n, 'start')
        return allocated(yield* file.readAlloc(4))
      }),
  },
  {
    work: 'reading more letters than it holds',
    seen: 'hello',
    observe: (fs) => Effect.flatMap(opened(fs, 'r'), (file) => Effect.map(file.readAlloc(8), allocated)),
  },
  {
    work: 'opening it without saying how and reading it whole',
    seen: 'hello',
    observe: (fs) => Effect.flatMap(fs.open(note), (file) => Effect.map(file.readAlloc(5), allocated)),
  },
  {
    work: 'opening it with only a permission in mind and reading it whole',
    seen: 'hello',
    observe: (fs) => Effect.flatMap(fs.open(note, { mode: 0o600 }), (file) => Effect.map(file.readAlloc(5), allocated)),
  },
  {
    work: 'reading its first three letters into a waiting buffer',
    seen: 'hel',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r')
        const buffer = new Uint8Array(3)
        const count = yield* file.read(buffer)
        return decode(buffer.subarray(0, count))
      }),
  },
  {
    work: 'writing one letter over its first letter',
    seen: 'Jello',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r+')
        yield* file.write(encode('J'))
        return yield* textOf(fs)
      }),
  },
  {
    work: 'asking how many letters it holds',
    seen: '5',
    observe: (fs) => Effect.flatMap(opened(fs, 'r'), (file) => Effect.map(file.stat, (info) => String(info.size))),
  },
  {
    work: 'flushing it to storage',
    seen: 'hello',
    observe: (fs) => Effect.flatMap(opened(fs, 'r+'), (file) => Effect.andThen(file.sync, textOf(fs))),
  },
  {
    work: 'cutting it back to nothing',
    seen: '',
    observe: (fs) => Effect.flatMap(opened(fs, 'r+'), (file) => Effect.andThen(file.truncate(), textOf(fs))),
  },
  {
    work: 'lengthening it and writing where the reader stands',
    seen: 'heZlo\u0000\u0000\u0000',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r+')
        yield* file.seek(2n, 'start')
        yield* file.truncate(8)
        yield* file.writeAll(encode('Z'))
        return yield* textOf(fs)
      }),
  },
  {
    work: 'trying to move before its first letter and then asking where the reader is',
    seen: '0',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r')
        yield* Effect.exit(file.seek(-1n, 'start'))
        return String(yield* file.seek(0n, 'current'))
      }),
  },
]

type Refusal = {
  readonly use: string
  readonly reason: string
  readonly method: string
  readonly attempt: (fs: FileSystem.FileSystem) => Effect.Effect<void, Error.PlatformError>
}

const afterClosing = (
  fs: FileSystem.FileSystem,
  use: (file: FileSystem.File) => Effect.Effect<void, Error.PlatformError>,
): Effect.Effect<void, Error.PlatformError> => Effect.flatMap(Effect.scoped(opened(fs, 'r+')), use)

const refusals: ReadonlyArray<Refusal> = [
  {
    use: 'move the reader before the first letter',
    reason: 'BadArgument',
    method: 'seek',
    attempt: (fs) => Effect.scoped(Effect.flatMap(opened(fs, 'r'), (file) => Effect.asVoid(file.seek(-1n, 'start')))),
  },
  {
    use: 'ask how many letters it holds once it is closed',
    reason: 'BadResource',
    method: 'stat',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.stat)),
  },
  {
    use: 'read into a buffer once it is closed',
    reason: 'BadResource',
    method: 'read',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.read(new Uint8Array(2)))),
  },
  {
    use: 'read a fresh buffer once it is closed',
    reason: 'BadResource',
    method: 'readAlloc',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.readAlloc(2))),
  },
  {
    use: 'write a letter once it is closed',
    reason: 'BadResource',
    method: 'write',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.write(encode('z')))),
  },
  {
    use: 'write a whole word once it is closed',
    reason: 'BadResource',
    method: 'writeAll',
    attempt: (fs) => afterClosing(fs, (file) => file.writeAll(encode('zz'))),
  },
  {
    use: 'flush it once it is closed',
    reason: 'BadResource',
    method: 'sync',
    attempt: (fs) => afterClosing(fs, (file) => file.sync),
  },
  {
    use: 'cut it short once it is closed',
    reason: 'BadResource',
    method: 'truncate',
    attempt: (fs) => afterClosing(fs, (file) => file.truncate(1)),
  },
]

Feature('Reading and writing an open file from a position that moves')
  .withScenarioLayer(MemoryFileSystem.make({ [note]: 'hello' }).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Working through an open note by <work> shows what was done',
      works,
      (row) =>
        Gherkin.Do.pipe(
          Given('a note of five letters')('fs', () => filesystem),
          When('the note is opened and worked through')('seen', (s) => Effect.scoped(row.observe(s.fs))),
          Then('what the note shows afterwards matches the work')((s) => {
            expect(s.seen).toBe(row.seen)
          }),
        ),
    )

    scenarioOutline(
      'Trying to <use> is turned down',
      refusals,
      (row) =>
        Gherkin.Do.pipe(
          Given('a note of five letters')('fs', () => filesystem),
          When('the note is used that way')('refusal', (s) => Effect.flip(row.attempt(s.fs))),
          Then('the refusal names what went wrong and which use it was')((s) => {
            expect(s.refusal.reason._tag).toBe(row.reason)
            expect(s.refusal.reason.method).toBe(row.method)
          }),
        ),
    )
  })
