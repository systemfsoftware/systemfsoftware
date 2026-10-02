/**
 * @internal The seed store's shell (KTD6, R16): the asynchronous file access the engine uses — read a test file's
 * store lines beside it, and append one failing entry's line. The line grammar is `seed-store.schema.ts` and the
 * decisions are `seed-record.ts`; nothing reads or writes a file synchronously here.
 *
 * @since 4.0.0
 */
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Function from 'effect/Function'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import { type SeedStoreEntry, SeedStoreLine } from './seed-store.schema.js'

const STORE_DIRECTORY = '__property_seeds__'

/** @internal */
export const storeFileOf = (filepath: string): Effect.Effect<string, never, Path.Path> =>
  Effect.map(
    Effect.service(Path.Path),
    (path) => path.join(path.dirname(filepath), STORE_DIRECTORY, `${path.basename(filepath)}.jsonl`),
  )

const linesOf = (text: string): ReadonlyArray<string> => text.length === 0 ? [] : text.replace(/\n$/u, '').split('\n')

const readText = (file: string) =>
  Effect.flatMap(
    Effect.service(FileSystem.FileSystem),
    (fs) => Effect.flatMap(fs.exists(file), (there) => there ? fs.readFileString(file) : Effect.succeed('')),
  )

/** @internal */
export const readStoreLines = (
  file: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> =>
  Effect.map(readText(file).pipe(Effect.orDie), linesOf)

const appendLine = (
  file: string,
  line: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    Effect.service(FileSystem.FileSystem),
    (fs) =>
      Effect.flatMap(Effect.service(Path.Path), (path) =>
        Effect.flatMap(fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.orDie), () =>
          fs.writeFileString(file, `${line}\n`, { flag: 'a' }).pipe(Effect.orDie))),
  )

const appendEntry = (
  filepath: string,
  entry: SeedStoreEntry,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    storeFileOf(filepath),
    (file) =>
      Effect.flatMap(Schema.encodeEffect(SeedStoreLine)(entry).pipe(Effect.orDie), (line) => appendLine(file, line)),
  )

/** @internal */
export const appendStoreEntry: {
  (filepath: string, entry: SeedStoreEntry): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>
  (entry: SeedStoreEntry): (filepath: string) => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>
} = Function.dual(2, appendEntry)
