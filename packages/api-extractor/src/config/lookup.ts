import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

const checkCandidate = (
  candidate: string,
  fs: FileSystem.FileSystem,
): Effect.Effect<Option.Option<string>> =>
  fs.exists(candidate).pipe(
    Effect.map((exists) => (exists ? Option.some(candidate) : Option.none())),
    Effect.orElseSucceed(() => Option.none()),
  )

const probeFolder = (
  folder: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> => {
  const configSub = path.join(folder, 'config', 'api-extractor.json')
  const rootFile = path.join(folder, 'api-extractor.json')
  return checkCandidate(configSub, fs).pipe(
    Effect.filterOrElse(Option.isSome, () => checkCandidate(rootFile, fs)),
  )
}

const isAtRoot = (parent: string, current: string): boolean => parent.length === 0 || parent === current

const continueUp = (
  parent: string,
  current: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  isAtRoot(parent, current) ? Effect.succeedNone : walkUpFolders(parent, fs, path)

const walkUpFolders = (
  current: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Option.Option<string>> =>
  probeFolder(current, fs, path).pipe(
    Effect.filterOrElse(
      Option.isSome,
      () => continueUp(path.dirname(current), current, fs, path),
    ),
  )

export const findConfigFileUpwards = (
  startFolder: string,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolved = path.resolve(startFolder)
    return yield* walkUpFolders(resolved, fs, path)
  })
