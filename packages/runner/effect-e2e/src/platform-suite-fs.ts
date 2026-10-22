import { Effect, FileSystem, Layer, Match, Path } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import { SuiteFsError } from './suite-fs.schema.js'
import { SuiteFs } from './suite-fs.service.js'
import type { SuiteFsShape, SuiteModule } from './suite-fs.service.js'

const SKIPPED_NAMES: Record<string, true> = { node_modules: true }

const isSuiteName = (name: string): boolean => !name.startsWith('.') && SKIPPED_NAMES[name] === undefined

const walk = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  prefix: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, PlatformError> =>
  Effect.flatMap(fs.readDirectory(path.join(root, ...prefix)), (names) =>
    Effect.map(
      Effect.forEach(names.filter(isSuiteName), (name) =>
        Effect.flatMap(fs.stat(path.join(root, ...prefix, name)), (info) =>
          Match.value(info.type).pipe(
            Match.when('Directory', () =>
              walk(fs, path, root, [...prefix, name])),
            Match.when('File', () => Effect.succeed([[...prefix, name].join('/')])),
            Match.orElse(() => Effect.succeed([])),
          ))),
      (nested) =>
        nested.flat(),
    ))

const failure = (operation: string, path: string) => <E>(cause: E): SuiteFsError =>
  new SuiteFsError({ operation, path, cause })

const importAt = (url: URL): Promise<SuiteModule> => import(url.href)

const make = (
  suiteRoot: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): SuiteFsShape => ({
  exists: (file) => Effect.orElseSucceed(fs.exists(path.join(suiteRoot, file)), () => false),
  readFileString: (file) =>
    Effect.mapError(fs.readFileString(path.join(suiteRoot, file)), failure('readFileString', file)),
  writeFileString: (file, content) =>
    Effect.mapError(
      Effect.andThen(
        fs.makeDirectory(path.dirname(path.join(suiteRoot, file)), { recursive: true }),
        fs.writeFileString(path.join(suiteRoot, file), content),
      ),
      failure('writeFileString', file),
    ),
  makeDirectory: (file) =>
    Effect.mapError(fs.makeDirectory(path.join(suiteRoot, file), { recursive: true }), failure('makeDirectory', file)),
  listFiles: Effect.mapError(
    Effect.map(walk(fs, path, suiteRoot, []), (files) => files.toSorted()),
    failure('listFiles', '.'),
  ),
  importModule: (file) =>
    Effect.flatMap(
      Effect.mapError(path.toFileUrl(path.join(suiteRoot, file)), failure('importModule', file)),
      (url) => Effect.tryPromise({ try: () => importAt(url), catch: failure('importModule', file) }),
    ),
})

export const layer = (suiteRoot: string): Layer.Layer<SuiteFs, never, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    SuiteFs,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return make(suiteRoot, fs, path)
    }),
  )
