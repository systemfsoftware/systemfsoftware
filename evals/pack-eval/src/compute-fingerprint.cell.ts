import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Console, Effect, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { DatasetFileRefusal } from './dataset-file.schema.js'
import { EvidenceFloor } from './eval-report.schema.js'
import { resolveFingerprintDigest, ResolveFingerprintDigestCommand } from './resolve-fingerprint-digest.workflow.js'

export interface FingerprintRequest {
  readonly packDirs: ReadonlyArray<string>
  readonly datasetDir: string
  readonly codeRoot: string
  readonly lockfilePath: string
  readonly selectorModel: string
  readonly judgeModel: string | undefined
  readonly seed: number
  readonly iterations: number
  readonly confidence: number
  readonly evidenceFloor: EvidenceFloor
}

type FingerprintRead = (typeof ResolveFingerprintDigestCommand)['Encoded']

interface FingerprintEntry {
  readonly relativePath: string
  readonly content: string
}

const DATASET_FILE_NAMES: ReadonlyArray<string> = [
  'selector-instruction.json',
  'tasks.json',
  'routing-labels.json',
  'pair-labels.json',
  'judge-prompt.json',
]

const refusalAt = (path: string) => (error: { readonly message: string }): DatasetFileRefusal =>
  new DatasetFileRefusal({ path, reason: error.message })

const entryOf = (relativePath: string) => (content: string): FingerprintEntry => ({ relativePath, content })

const fileEntryOf = (
  fileSystem: FileSystem.FileSystem,
  relativePath: string,
  path: string,
): Effect.Effect<Option.Option<FingerprintEntry>, PlatformError> =>
  Effect.flatMap(fileSystem.stat(path), (info) =>
    info.type === 'File'
      ? Effect.map(fileSystem.readFileString(path), (content) => Option.some(entryOf(relativePath)(content)))
      : Effect.succeedNone)

const filesUnder = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  relativeRoot: string,
  dir: string,
): Effect.Effect<ReadonlyArray<FingerprintEntry>, DatasetFileRefusal> =>
  Effect.flatMap(
    fileSystem.readDirectory(dir, { recursive: true }),
    (names) =>
      Effect.map(
        Effect.forEach(names, (name) => fileEntryOf(fileSystem, `${relativeRoot}/${name}`, paths.join(dir, name))),
        Arr.getSomes,
      ),
  ).pipe(Effect.mapError(refusalAt(dir)))

const packIdOf = (paths: Path.Path, dir: string): string => paths.basename(paths.resolve(dir))

const packEntries = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  dir: string,
): Effect.Effect<ReadonlyArray<FingerprintEntry>, DatasetFileRefusal> =>
  filesUnder(fileSystem, paths, `pack/${packIdOf(paths, dir)}`, dir)

const datasetEntry = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  datasetDir: string,
  name: string,
): Effect.Effect<Option.Option<FingerprintEntry>, DatasetFileRefusal> => {
  const path = paths.join(datasetDir, name)
  return fileSystem.exists(path).pipe(
    Effect.flatMap((present) =>
      present
        ? Effect.map(fileSystem.readFileString(path), (content) => Option.some(entryOf(`dataset/${name}`)(content)))
        : Effect.succeedNone
    ),
    Effect.mapError(refusalAt(path)),
  )
}

const datasetEntries = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<ReadonlyArray<FingerprintEntry>, DatasetFileRefusal> =>
  Effect.forEach(DATASET_FILE_NAMES, (name) => datasetEntry(fileSystem, paths, datasetDir, name)).pipe(
    Effect.map(Arr.getSomes),
  )

const codeEntries = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  codeRoot: string,
): Effect.Effect<ReadonlyArray<FingerprintEntry>, DatasetFileRefusal> =>
  filesUnder(fileSystem, paths, 'code/src', paths.join(codeRoot, 'src'))

const lockfileEntry = (
  fileSystem: FileSystem.FileSystem,
  lockfilePath: string,
): Effect.Effect<FingerprintEntry, DatasetFileRefusal> =>
  Effect.map(fileSystem.readFileString(lockfilePath), entryOf('lockfile')).pipe(
    Effect.mapError(refusalAt(lockfilePath)),
  )

const modelEntries = (request: FingerprintRequest): ReadonlyArray<FingerprintEntry> => [
  entryOf('model/selector')(request.selectorModel),
  entryOf('model/judge')(request.judgeModel ?? ''),
]

const parameterEntries = (request: FingerprintRequest): ReadonlyArray<FingerprintEntry> => [
  entryOf('params/seed')(String(request.seed)),
  entryOf('params/iterations')(String(request.iterations)),
  entryOf('params/confidence')(String(request.confidence)),
  entryOf('params/evidence-floor')(`${request.evidenceFloor.positives}/${request.evidenceFloor.negatives}`),
]

const entriesOf = (
  fileSystem: FileSystem.FileSystem,
  paths: Path.Path,
  request: FingerprintRequest,
): Effect.Effect<ReadonlyArray<FingerprintEntry>, DatasetFileRefusal> =>
  Effect.gen(function*() {
    const packs = yield* Effect.forEach(request.packDirs, (dir) => packEntries(fileSystem, paths, dir))
    const dataset = yield* datasetEntries(fileSystem, paths, request.datasetDir)
    const code = yield* codeEntries(fileSystem, paths, request.codeRoot)
    const lockfile = yield* lockfileEntry(fileSystem, request.lockfilePath)
    return [
      ...Arr.flatten(packs),
      ...dataset,
      ...code,
      lockfile,
      ...modelEntries(request),
      ...parameterEntries(request),
    ]
  })

const lineOf = (entry: FingerprintEntry): string => `${entry.relativePath}\u0000${entry.content}`

const materialOf = (entries: ReadonlyArray<FingerprintEntry>): string => entries.map(lineOf).toSorted().join('\u0001')

const byteHexOf = (byte: number): string => byte.toString(16).padStart(2, '0')

const digestHexOf = (entries: ReadonlyArray<FingerprintEntry>): Effect.Effect<string, DatasetFileRefusal> =>
  Effect.map(
    Effect.tryPromise({
      try: () => globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(materialOf(entries))),
      catch: () => new DatasetFileRefusal({ path: 'the fingerprint inputs', reason: 'the sha256 digest failed' }),
    }),
    (digest) => Array.from(new Uint8Array(digest)).map(byteHexOf).join(''),
  )

const read = (
  request: FingerprintRequest,
): Effect.Effect<FingerprintRead, DatasetFileRefusal, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const entries = yield* entriesOf(fileSystem, paths, request)
    const digest = yield* digestHexOf(entries)
    return { digest, fileCount: entries.length }
  })

const printUncovered: Effect.Effect<number> = Effect.as(
  Console.log(
    'no fingerprint inputs were covered; give at least one pack, the dataset, the evaluator code root, and the lockfile',
  ),
  2,
)

export const run = Sandwich.named('pack-eval.fingerprint')((request: FingerprintRequest) => read(request))
  .decide(resolveFingerprintDigest)
  .write({
    FingerprintCovered: (covered) => Effect.as(Console.log(covered.digest), 0),
    FingerprintUncovered: () => printUncovered,
    CommandRejected: (rejected) =>
      Effect.fail(new DatasetFileRefusal({ path: 'the fingerprint inputs', reason: rejected.issue })),
  })
