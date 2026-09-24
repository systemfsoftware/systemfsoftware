import { Effect, HashMap, Layer, Option, Ref, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { AnswerCache } from '../answer-cache.service.js'
import type { AnswerCacheKey, CachedAnswer } from '../answer-cache.service.js'
import { AnswerCacheFailure, AnswerCacheFile } from '../selection-trace.schema.js'

type Entries = Readonly<Record<string, CachedAnswer>>

interface Store {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
  readonly cacheDir: string
  readonly files: Ref.Ref<HashMap.HashMap<string, Entries>>
}

const fileNameOf = (model: string): string => `${encodeURIComponent(model)}.json`

const entryPathOf = (key: AnswerCacheKey): string => `${key.role}/${fileNameOf(key.model)}`

const readFailureOf = (source: string, error: { readonly message: string }): AnswerCacheFailure =>
  new AnswerCacheFailure({ operation: 'read', source, message: error.message })

const readEntries = (store: Store, relative: string): Effect.Effect<readonly [string, Entries], AnswerCacheFailure> => {
  const fullPath = store.path.join(store.cacheDir, relative)
  const decodeFile = Schema.decodeEffect(Schema.fromJsonString(AnswerCacheFile))
  return store.fileSystem.readFileString(fullPath).pipe(
    Effect.mapError((error) => readFailureOf(fullPath, error)),
    Effect.flatMap((text) => Effect.mapError(decodeFile(text), (error) => readFailureOf(fullPath, error))),
    Effect.map((file): readonly [string, Entries] => [relative, file.entries]),
  )
}

const listedFiles = (store: Store): Effect.Effect<ReadonlyArray<string>, AnswerCacheFailure> =>
  store.fileSystem.exists(store.cacheDir).pipe(
    Effect.mapError((error) => readFailureOf(store.cacheDir, error)),
    Effect.flatMap((present) =>
      present
        ? store.fileSystem.readDirectory(store.cacheDir, { recursive: true }).pipe(
          Effect.mapError((error) => readFailureOf(store.cacheDir, error)),
          Effect.map((names) => names.filter((name) => name.endsWith('.json'))),
        )
        : Effect.succeed([])
    ),
  )

const loadFiles = (store: Store): Effect.Effect<HashMap.HashMap<string, Entries>, AnswerCacheFailure> =>
  Effect.flatMap(listedFiles(store), (names) =>
    Effect.forEach(names, (relative) => readEntries(store, relative)).pipe(
      Effect.map(HashMap.fromIterable),
    ))

const writeEntries = (store: Store, relative: string, entries: Entries): Effect.Effect<void, AnswerCacheFailure> => {
  const fullPath = store.path.join(store.cacheDir, relative)
  const encodeFile = Schema.encodeEffect(Schema.fromJsonString(AnswerCacheFile))
  return Effect.gen(function*() {
    yield* store.fileSystem.makeDirectory(store.path.dirname(fullPath), { recursive: true })
    const text = yield* encodeFile({ version: 1, entries })
    yield* store.fileSystem.writeFileString(fullPath, text)
  }).pipe(
    Effect.mapError((error) =>
      new AnswerCacheFailure({ operation: 'write', source: fullPath, message: error.message })
    ),
  )
}

const writeBack = (store: Store): Effect.Effect<void, AnswerCacheFailure> =>
  Effect.flatMap(
    Ref.get(store.files),
    (files) =>
      Effect.asVoid(
        Effect.forEach(HashMap.toEntries(files), ([relative, entries]) => writeEntries(store, relative, entries)),
      ),
  )

const answerAt = (files: HashMap.HashMap<string, Entries>, key: AnswerCacheKey): Option.Option<CachedAnswer> =>
  Option.flatMap(HashMap.get(files, entryPathOf(key)), (entries) => Option.fromUndefinedOr(entries[key.promptDigest]))

const remember = (
  files: HashMap.HashMap<string, Entries>,
  key: AnswerCacheKey,
  answer: CachedAnswer,
): HashMap.HashMap<string, Entries> => {
  const relative = entryPathOf(key)
  const entries = Option.getOrElse(HashMap.get(files, relative), (): Entries => ({}))
  const next: Entries = { ...entries, [key.promptDigest]: answer }
  return HashMap.set(files, relative, next)
}

const open = (cacheDir: string): Effect.Effect<Store, AnswerCacheFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const store: Store = { fileSystem, path, cacheDir, files: yield* Ref.make(HashMap.empty<string, Entries>()) }
    yield* Ref.set(store.files, yield* loadFiles(store))
    return store
  })

export const layer = (
  options: { readonly cacheDir: string },
): Layer.Layer<AnswerCache, AnswerCacheFailure, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    AnswerCache,
    Effect.map(
      Effect.acquireRelease(open(options.cacheDir), (store) => Effect.orDie(writeBack(store))),
      (store) =>
        AnswerCache.of({
          get: (key) => Effect.map(Ref.get(store.files), (files) => answerAt(files, key)),
          set: (key, answer) => Effect.asVoid(Ref.update(store.files, (files) => remember(files, key, answer))),
        }),
    ),
  )
