import { Conformance } from '@systemfsoftware/conformance-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Data, Effect, Match, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import type { FileCommand, FileResponse, Refusal } from './file-system.model.js'

const Text = Schema.Literals(['one', 'two'])

export const SharedLetterCommand = Schema.Union([
  Schema.TaggedStruct('WriteFile', { path: Schema.Literal('/d.txt'), text: Text }),
  Schema.TaggedStruct('ReadFile', { path: Schema.Literal('/d.txt') }),
])

const done: FileResponse = { _tag: 'Done' }

const reasonOf = (error: PlatformError.PlatformError): Refusal =>
  Match.value(error.reason).pipe(
    Match.tag('NotFound', (): Refusal => 'NotFound'),
    Match.tag('AlreadyExists', (): Refusal => 'AlreadyExists'),
    Match.tag('BadResource', (): Refusal => 'BadResource'),
    Match.tag('PermissionDenied', (): Refusal => 'PermissionDenied'),
    Match.orElse((): Refusal => 'Unknown'),
  )

const operation = (
  fs: FileSystem.FileSystem,
  command: FileCommand,
): Effect.Effect<FileResponse, PlatformError.PlatformError> =>
  Match.value(command).pipe(
    Match.tag('WriteFile', (write) => Effect.as(fs.writeFileString(write.path, write.text), done)),
    Match.tag('ReadFile', (read) =>
      Effect.map(fs.readFileString(read.path), (text): FileResponse => ({ _tag: 'Content', text }))),
    Match.tag('MakeDirectory', (make) =>
      Effect.as(fs.makeDirectory(make.path, { recursive: make.recursive }), done)),
    Match.tag('Remove', (removal) => Effect.as(fs.remove(removal.path, { recursive: removal.recursive }), done)),
    Match.tag('MakeReadOnly', (lock) => Effect.as(fs.chmod(lock.path, 0o444), done)),
    Match.exhaustive,
  )

export const storeResponse = (command: FileCommand): Effect.Effect<FileResponse, never, FileSystem.FileSystem> =>
  Effect.flatMap(Effect.service(FileSystem.FileSystem), (fs) =>
    operation(fs, command).pipe(
      Effect.catch((error) => Effect.succeed<FileResponse>({ _tag: 'Refused', reason: reasonOf(error) })),
    ))

export class WatchLeftOpen extends Data.TaggedError('WatchLeftOpen')<{ readonly paths: ReadonlyArray<string> }> {}

export const noWatchLeftOpen: Effect.Effect<void, WatchLeftOpen, MemoryFileSystem.Watcher> = Effect.flatMap(
  Effect.service(MemoryFileSystem.Watcher),
  (watcher) =>
    Effect.flatMap(
      watcher.openWatches,
      (paths) => paths.length === 0 ? Effect.void : Effect.fail(new WatchLeftOpen({ paths })),
    ),
)

export class CheckRejected extends Data.TaggedError('CheckRejected')<{ readonly report: string }> {}

export const passedHistories = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )

export const rejection = <C, R>(report: Conformance.Report<C, R>): string =>
  Match.value(report).pipe(
    Match.tag('Pass', () => {
      throw new CheckRejected({ report: 'the check passed where it had to fail' })
    }),
    Match.orElse(() => Conformance.render(report)),
  )
