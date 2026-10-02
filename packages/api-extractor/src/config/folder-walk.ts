import * as Effect from 'effect/Effect'
import type { FileSystem } from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

export const CONFIG_FILE_NAME = 'api-extractor.json'

export const PACKAGE_FILE_NAME = 'package.json'

export const TSCONFIG_FILE_NAME = 'tsconfig.json'

const parentFolderOf = (folder: string, path: Path.Path): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(path.dirname(folder)), (parent) => parent.length > 0 && parent !== folder)

export const ancestorsNearestFirst = dual<
  (path: Path.Path) => (folder: string) => readonly string[],
  (folder: string, path: Path.Path) => readonly string[]
>(2, (folder: string, path: Path.Path): readonly string[] =>
  Option.match(parentFolderOf(folder, path), {
    onNone: (): readonly string[] => [folder],
    onSome: (parent): readonly string[] => [folder, ...ancestorsNearestFirst(parent, path)],
  }))

export interface FilePresence {
  readonly path: Option.Option<string>
  readonly unreadable: Option.Option<PlatformError>
}

export const filePresent = dual<
  (fs: FileSystem) => (filePath: string) => Effect.Effect<FilePresence>,
  (filePath: string, fs: FileSystem) => Effect.Effect<FilePresence>
>(2, (filePath: string, fs: FileSystem): Effect.Effect<FilePresence> =>
  fs.exists(filePath).pipe(
    Effect.map(
      (present): FilePresence => ({
        path: Option.filter(Option.some(filePath), () => present),
        unreadable: Option.none(),
      }),
    ),
    Effect.catchReason(
      'PlatformError',
      'NotFound',
      (): Effect.Effect<FilePresence> => Effect.succeed({ path: Option.none(), unreadable: Option.none() }),
    ),
    Effect.catch(
      (cause): Effect.Effect<FilePresence> => Effect.succeed({ path: Option.none(), unreadable: Option.some(cause) }),
    ),
  ))

export const presentPathOf = (presence: FilePresence): Option.Option<string> => presence.path

/**
 * One optional read with one home: the file's text, absent only when the host reports the path
 * as not found. Every other `PlatformError` — a directory, a permission denial, a descriptor
 * failure — stays in the error channel, because upstream reads after an existence probe and
 * lets the read throw (`SourceMapper._getSourceMap`, `ExtractorConfig._loadConfigFileWithExtends`).
 */
export const readOptionalText = dual<
  (fs: FileSystem) => (filePath: string) => Effect.Effect<Option.Option<string>, PlatformError>,
  (filePath: string, fs: FileSystem) => Effect.Effect<Option.Option<string>, PlatformError>
>(
  2,
  (filePath: string, fs: FileSystem): Effect.Effect<Option.Option<string>, PlatformError> =>
    fs.readFileString(filePath).pipe(
      Effect.asSome,
      Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeedNone),
    ),
)
