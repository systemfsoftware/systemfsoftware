import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Cause, Context, Effect, Exit, Option, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Error from 'effect/PlatformError'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const note = '/notes/hello.txt'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

const textOf = (fs: FileSystem.FileSystem): Effect.Effect<string, Error.PlatformError> =>
  Effect.map(fs.readFile(note), decode)

const allocated = (contents: Option.Option<Uint8Array>): string =>
  Option.match(contents, { onNone: () => 'nothing', onSome: decode })

type Top<A = unknown> = A

const defectsOf = <A, E>(exit: Exit.Exit<A, E>): ReadonlyArray<Top> =>
  Exit.match(exit, {
    onSuccess: () => [],
    onFailure: (cause) => cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
  })

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
  {
    work: 'writing nothing at all and then asking where the reader is',
    seen: '0 hello',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r+')
        yield* file.writeAll(new Uint8Array(0))
        const position = yield* file.seek(0n, 'current')
        return `${position} ${yield* textOf(fs)}`
      }),
  },
  {
    work: 'moving further than any file can reach and reading on',
    seen: 'BadResource readAlloc',
    observe: (fs) =>
      Effect.gen(function*() {
        const file = yield* opened(fs, 'r')
        yield* file.seek(2n ** 53n, 'start')
        return yield* Effect.match(file.readAlloc(4), {
          onFailure: (refusal) => `${refusal.reason._tag} ${refusal.reason.method}`,
          onSuccess: allocated,
        })
      }),
  },
]

type Use = {
  readonly use: string
  readonly attempt: (fs: FileSystem.FileSystem) => Effect.Effect<void, Error.PlatformError>
}

const afterClosing = (
  fs: FileSystem.FileSystem,
  use: (file: FileSystem.File) => Effect.Effect<void, Error.PlatformError>,
): Effect.Effect<void, Error.PlatformError> => Effect.flatMap(Effect.scoped(opened(fs, 'r+')), use)

const closedUses: ReadonlyArray<Use> = [
  {
    use: 'asking how many letters it holds',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.stat)),
  },
  {
    use: 'reading into a buffer',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.read(new Uint8Array(2)))),
  },
  {
    use: 'reading a fresh buffer',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.readAlloc(2))),
  },
  {
    use: 'writing a letter',
    attempt: (fs) => afterClosing(fs, (file) => Effect.asVoid(file.write(encode('z')))),
  },
  {
    use: 'writing a whole word',
    attempt: (fs) => afterClosing(fs, (file) => file.writeAll(encode('zz'))),
  },
  {
    use: 'flushing it',
    attempt: (fs) => afterClosing(fs, (file) => file.sync),
  },
  {
    use: 'cutting it short',
    attempt: (fs) => afterClosing(fs, (file) => file.truncate(1)),
  },
]

type Ending = {
  readonly ending: string
  readonly givesUp: boolean
}

const endings: ReadonlyArray<Ending> = [
  { ending: 'after a successful read', givesUp: false },
  { ending: 'after a read that gives up', givesUp: true },
]

const descriptorOf = (fs: MemoryFileSystem.MemoryFileSystemHandle) =>
  Effect.scoped(
    Effect.map(MemoryFileSystem.Definition.children.open(fs, note, { flag: 'r' }), (file) => file.fd),
  )

Feature('Reading and writing an open file from a position that moves')
  .withScenarioLayer(MemoryFileSystem.make({ [note]: 'hello' }).layer)
  .body(({ scenario, scenarioOutline }) => {
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

    scenario(
      'Moving the reader before the first letter is turned down',
      Gherkin.Do.pipe(
        Given('a note of five letters')('fs', () => filesystem),
        When('the reader is moved before the first letter')('refusal', (s) =>
          Effect.flip(
            Effect.scoped(Effect.flatMap(opened(s.fs, 'r'), (file) => Effect.asVoid(file.seek(-1n, 'start')))),
          )),
        Then('the refusal says the move was not allowed')((s) => {
          expect(s.refusal.reason._tag).toBe('BadArgument')
          expect(s.refusal.reason.method).toBe('seek')
        }),
      ),
    )

    scenario(
      'Writing nothing at all leaves the note and the reader where they were',
      Gherkin.Do.pipe(
        Given('a note of five letters')('fs', () => filesystem),
        When('nothing is written to the note')('where', (s) =>
          Effect.scoped(Effect.gen(function*() {
            const file = yield* opened(s.fs, 'r+')
            yield* file.writeAll(new Uint8Array(0))
            const at = yield* file.seek(0n, 'current')
            const text = yield* textOf(s.fs)
            return `${at}:${text}`
          }))),
        Then('the note still reads the same and the reader has not moved')((s) => {
          expect(s.where).toBe('0:hello')
        }),
      ),
    )

    scenarioOutline(
      'Once the note is closed, <use> is refused',
      closedUses,
      (row) =>
        Gherkin.Do.pipe(
          Given('a note of five letters')('fs', () => filesystem),
          When('the note is used that way')('outcome', (s) => Effect.exit(row.attempt(s.fs))),
          Then('the refusal names the closed note')((s) => {
            expect(defectsOf(s.outcome)).toMatchObject([{ _tag: 'HandleReleased', handle: 'OpenFile' }])
          }),
        ),
    )

    scenarioOutline(
      'A note opened inside a scope is closed once when the scope ends <ending>',
      endings,
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem holding a note of five letters')('fs', () =>
            MemoryFileSystem.make({ [note]: 'hello' }).scoped),
          When('the note is opened, read from inside a scope of its own, and that scope ends')('outcome', (s) =>
            Effect.flatMap(MemoryFileSystem.Definition.context(s.fs), (context) =>
              Effect.gen(function*() {
                const port = Context.get(context, FileSystem.FileSystem)
                const first = yield* descriptorOf(s.fs)
                const sealed = yield* Effect.exit(Effect.scoped(
                  Effect.gen(function*() {
                    const file = yield* opened(port, 'r')
                    const read = allocated(yield* file.readAlloc(5))
                    const ended = yield* Effect.exit(row.givesUp ? Effect.fail('the reader gave up') : Effect.void)
                    return { read, gaveUp: Exit.isFailure(ended) }
                  }),
                ))
                const last = yield* descriptorOf(s.fs)
                return { sealed, first, last }
              }))),
          Then('the note was read, the reader ended as it chose, and the volume took the descriptor back')((s) => {
            expect(Exit.isSuccess(s.outcome.sealed)).toBe(true)
            expect(s.outcome.last).toBe(s.outcome.first)
            Exit.match(s.outcome.sealed, {
              onSuccess: ({ read, gaveUp }) => {
                expect(read).toBe('hello')
                expect(gaveUp).toBe(row.givesUp)
              },
              onFailure: () =>
                undefined,
            })
          }),
        ),
    )
  })
