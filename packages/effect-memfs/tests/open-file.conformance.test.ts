import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Context, Effect, Layer, Match, Option, Ref, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import { HandleLeftOpen } from './__fixtures__/HandleLeftOpen.schema.js'
import { passedHistories } from './__fixtures__/memfs-store.js'
import {
  FileHandleCommand,
  type FileHandleResponse,
  OpenedNoteText,
  openFileModel,
} from './__fixtures__/open-file.model.js'

const Feature = makeFeature({ it })

const note = '/notes/hello.txt'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

class OpenNote extends Context.Service<OpenNote, FileSystem.File>()(
  '@systemfsoftware/effect-memfs/tests/open-file.conformance.test/OpenNote',
) {}

const wrote = (count: number): FileHandleResponse => ({ _tag: 'Wrote', count })
const read = (text: string): FileHandleResponse => ({ _tag: 'Read', text })
const at = (position: bigint): FileHandleResponse => ({ _tag: 'At', position: Number(position) })
const refused = (method: string): FileHandleResponse => ({ _tag: 'Refused', method })
const done: FileHandleResponse = { _tag: 'Done' }
const nothing: FileHandleResponse = { _tag: 'Nothing' }

const readInto = (
  file: FileSystem.File,
  size: number,
): Effect.Effect<FileHandleResponse, PlatformError.PlatformError> =>
  Effect.suspend(() => {
    const buffer = new Uint8Array(size)
    return Effect.map(file.read(buffer), (count) => read(decode(buffer.subarray(0, count))))
  })

const readAllOf = (
  file: FileSystem.File,
  size: number,
): Effect.Effect<FileHandleResponse, PlatformError.PlatformError> =>
  Effect.map(
    file.readAlloc(size),
    (contents) => Option.match(contents, { onNone: () => nothing, onSome: (bytes) => read(decode(bytes)) }),
  )

const applied = (
  file: FileSystem.File,
  command: FileHandleCommand,
): Effect.Effect<FileHandleResponse, PlatformError.PlatformError> =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      WriteAll: (write) => Effect.as(file.writeAll(encode(write.text)), wrote(write.text.length)),
      Write: (write) => Effect.map(file.write(encode(write.text)), wrote),
      Read: (slice) => readInto(file, slice.size),
      ReadAlloc: (slice) => readAllOf(file, slice.size),
      Seek: (seek) => Effect.map(file.seek(BigInt(seek.offset), 'start'), at),
      Step: (step) => Effect.map(file.seek(BigInt(step.offset), 'current'), at),
      Truncate: (cut) => Effect.as(file.truncate(cut.length), done),
      Sync: () => Effect.as(file.sync, done),
      Where: () => Effect.map(file.seek(0n, 'current'), at),
    }),
  )

const refusalOf = (error: PlatformError.PlatformError): FileHandleResponse =>
  Match.value(error.reason).pipe(
    Match.tag('BadArgument', (reason) => refused(reason.method)),
    Match.orElse(() => refused('unknown')),
  )

const runFileCommand = (command: FileHandleCommand): Effect.Effect<FileHandleResponse, never, OpenNote> =>
  Effect.flatMap(
    OpenNote,
    (file) => applied(file, command).pipe(Effect.catch((error) => Effect.succeed(refusalOf(error)))),
  )

const openNote: Layer.Layer<OpenNote> = Layer.effect(
  OpenNote,
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.open(note, { flag: 'r+' })),
).pipe(Layer.provide(MemoryFileSystem.make({ [note]: OpenedNoteText }).layer), Layer.orDie)

const openFileCheck = (subject: Layer.Layer<OpenNote>) =>
  Conformance.sequential(subject, {
    commands: FileHandleCommand,
    model: openFileModel,
    run: runFileCommand,
    sequences: 500,
    operations: 10,
  })

const borrowedNote = (stash: Ref.Ref<Option.Option<FileSystem.File>>): Effect.Effect<
  void,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Scope.Scope
> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.flatMap(fs.open(note, { flag: 'r+' }), (file) =>
      Effect.andThen(
        Ref.set(stash, Option.some(file)),
        Effect.andThen(file.readAlloc(5), Effect.andThen(file.writeAll(encode('Z')), file.sync)),
      )))

const noHandleLeftOpen = (
  stash: Ref.Ref<Option.Option<FileSystem.File>>,
): Effect.Effect<void, HandleLeftOpen> =>
  Effect.flatMap(Ref.get(stash), (held) =>
    Option.match(held, {
      onNone: () => Effect.void,
      onSome: (file) =>
        Effect.matchEffect(file.stat, {
          onFailure: () => Effect.void,
          onSuccess: () =>
            Effect.fail(new HandleLeftOpen({ reason: 'the borrowed note still answers after being given up' })),
        }),
    }))

Feature('Reading and writing an open note from a position that moves', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'Five hundred rounds of ten writes, reads, moves, cuts and flushes get what a plain note and a bookmark would',
      Gherkin.Do.pipe(
        Given('an in-memory store holding a note of five letters, opened for reading and writing')(
          'subject',
          () => Effect.succeed(openNote),
        ),
        When('five hundred rounds of ten writes, reads, moves, cuts and flushes are played against the open note')(
          'report',
          (s) => openFileCheck(s.subject),
        ),
        Then('every round gets what a plain note and a bookmark would')((s) => {
          passedHistories(s.report)
        }),
      ),
    )

    scenario(
      'A note borrowed for reading and writing and stopped at any point reads as given up',
      Gherkin.Do.pipe(
        Given('an in-memory store holding a note of five letters, and somewhere to keep a borrowed one')(
          'borrowed',
          () =>
            Effect.map(
              Ref.make(Option.none<FileSystem.File>()),
              (stash) => ({ store: MemoryFileSystem.make({ [note]: OpenedNoteText }).layer, stash }),
            ),
        ),
        When('a piece of work borrows the note, reads it and writes a letter while being stopped at every step')(
          'report',
          (s) =>
            Conformance.released(Effect.provide(borrowedNote(s.borrowed.stash), s.borrowed.store), {
              probe: noHandleLeftOpen(s.borrowed.stash),
            }),
        ),
        Then('the borrowed note reads as given up after any stop')((s) => {
          passedHistories(s.report)
        }),
      ),
    )
  })
