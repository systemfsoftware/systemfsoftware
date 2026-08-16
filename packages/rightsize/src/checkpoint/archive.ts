/**
 * Portable checkpoint archives (R14) — the `checkpoint.json`-manifested tar
 * container `Checkpoints.exportTo`/`importFrom` traffic in. Behavioral
 * source: upstream rightsize-node `src/core/checkpoint/archive.ts`
 * (Apache-2.0) — the manifest shape is pinned identically in every
 * rightsize language implementation.
 *
 * An archive bundles exactly two members at its root: `checkpoint.json`
 * (format version, the checkpoint's name when registered, ref, backend,
 * creation time, and the pinned spec projection) and `artifact` (the
 * backend's own payload, byte-for-byte what `exportCheckpoint` produces).
 * `name` is `null` for an archive built from an unnamed (ephemeral)
 * checkpoint.
 *
 * The artifact callbacks are service-free Effects — the composing caller
 * closes over whatever services it needs (the active `CheckpointStore`,
 * typically). Temp staging/extraction directories are
 * `acquireUseRelease` resources, removed on success and failure alike.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect, Result, Schema as S } from 'effect'

import { BackendError, MalformedCheckpointArchiveError } from '../model/errors.js'
import type { CheckpointRegistrySpec } from './checkpoint.js'
import { isCheckpointRegistrySpec } from './registry.js'
import { runTar, TarCli } from './tar.js'

/** The one archive format version this library understands. */
export const CHECKPOINT_ARCHIVE_VERSION = 1

/**
 * An archive bundles a full backend artifact (a zstd-compressed msb
 * snapshot or a saved docker image) — generous relative to a plain
 * `docker cp`, matching the backend's own export/import budget.
 */
export const ARCHIVE_TAR_TIMEOUT_MS = 300_000

/**
 * `checkpoint.json`'s exact shape — pinned identically in every rightsize
 * language implementation. `name` is `null` for an archive built from an
 * unnamed checkpoint; every other field mirrors
 * `CheckpointRegistryEntry` plus the format version.
 */
export interface CheckpointArchiveMetadata {
  readonly rightsizeArchive: 1
  readonly name: string | null
  readonly ref: string
  readonly backend: string
  readonly createdIso: string
  readonly spec: CheckpointRegistrySpec
}

const malformed = (archivePath: string, reason: string): MalformedCheckpointArchiveError =>
  MalformedCheckpointArchiveError.make({ archivePath, reason })

/**
 * The manifest's JSON codec — the pinned wire shape, round-trippable
 * through `fromJsonString` (encode produces the exact `checkpoint.json`
 * bytes the format contract pins).
 */
const CheckpointArchiveMetadataJson = S.fromJsonString(
  S.Struct({
    rightsizeArchive: S.Literal(1),
    name: S.Union([S.Null, S.String]),
    ref: S.String,
    backend: S.String,
    createdIso: S.String,
    spec: S.Struct({
      env: S.Record(S.String, S.String),
      command: S.Union([S.Null, S.Array(S.String)]),
      exposedPorts: S.Array(S.Finite),
      memoryLimitMb: S.Union([S.Null, S.Finite]),
    }),
  }),
)

/** The manifest's canonical JSON bytes — encoded through the pinned codec. */
const serializeManifest = (metadata: CheckpointArchiveMetadata): string =>
  S.encodeSync(CheckpointArchiveMetadataJson)(metadata)

/** The `tryPromise({ catch })` mapper the archive's I/O edges use: a thrown typed error travels, anything else is a named `BackendError`. */
const ioFailureOf = (error: unknown): MalformedCheckpointArchiveError | BackendError =>
  S.is(MalformedCheckpointArchiveError)(error)
    ? error
    : BackendError.make({ message: error instanceof Error ? error.message : 'unknown error' })

/** Best-effort recursive removal of a staging dir — never fails the caller. */
const removeTempDir = (dir: string): Effect.Effect<void> =>
  Effect.promise(() => fsp.rm(dir, { recursive: true, force: true }).catch(() => {}))

/** A fresh staging temp directory — its failure names the staging act. */
const stagingDir = (prefix: string, action: string): Effect.Effect<string, BackendError> =>
  Effect.tryPromise({
    try: () => fsp.mkdtemp(path.join(os.tmpdir(), prefix)),
    catch: (error) =>
      BackendError.make({
        message: `could not ${action}: ${error instanceof Error ? error.message : 'unknown error'}`,
      }),
  })

/** One `tar` spawn as an Effect — a rejection (spawn failure/timeout) is a `BackendError`, never a defect. */
const tarRun = (args: readonly string[], timeoutMs: number, cwd: string): Effect.Effect<TarResult, BackendError> =>
  Effect.tryPromise({
    try: () => runTar(args, timeoutMs, cwd),
    catch: (error) => (
      S.is(BackendError)(error)
        ? error
        : BackendError.make({ message: error instanceof Error ? error.message : 'unknown error' })
    ),
  })

import type { TarCliResult as TarResult } from './tar.js'

/**
 * Parses and validates `text` (the extracted archive's `checkpoint.json`
 * content) into a `CheckpointArchiveMetadata`. Every failure — invalid
 * JSON, a `rightsizeArchive` value other than the version (named in the
 * error, per the pinned format's own contract), a malformed
 * `name`/`ref`/`backend`/`createdIso`/`spec` — is a
 * `MalformedCheckpointArchiveError` naming `archivePath` (the ORIGINAL
 * archive the caller passed to `importFrom`, not the temp-extracted json
 * path, so the error is actionable). Pure: never touches a backend or the
 * registry.
 */
export const parseCheckpointArchiveMetadata = (
  text: string,
  archivePath: string,
): Result.Result<CheckpointArchiveMetadata, MalformedCheckpointArchiveError> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return Result.fail(malformed(archivePath, 'checkpoint.json is not valid JSON'))
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return Result.fail(malformed(archivePath, 'checkpoint.json is not a JSON object'))
  }

  const version = 'rightsizeArchive' in parsed ? parsed.rightsizeArchive : undefined
  if (version !== CHECKPOINT_ARCHIVE_VERSION) {
    return Result.fail(
      malformed(
        archivePath,
        `unsupported rightsizeArchive version ${
          JSON.stringify(version)
        } (this library reads version ${CHECKPOINT_ARCHIVE_VERSION})`,
      ),
    )
  }
  const name = 'name' in parsed ? parsed.name : undefined
  if (name !== null && typeof name !== 'string') {
    return Result.fail(malformed(archivePath, "checkpoint.json's 'name' field must be a string or null"))
  }
  const ref = 'ref' in parsed ? parsed.ref : undefined
  const backend = 'backend' in parsed ? parsed.backend : undefined
  const createdIso = 'createdIso' in parsed ? parsed.createdIso : undefined
  if (typeof ref !== 'string' || typeof backend !== 'string' || typeof createdIso !== 'string') {
    return Result.fail(
      malformed(
        archivePath,
        "checkpoint.json is missing one of the required string fields 'ref', 'backend', 'createdIso'",
      ),
    )
  }
  const spec = 'spec' in parsed ? parsed.spec : undefined
  if (!isCheckpointRegistrySpec(spec)) {
    return Result.fail(malformed(archivePath, "checkpoint.json's 'spec' field is missing or malformed"))
  }

  return Result.succeed({
    rightsizeArchive: 1,
    name,
    ref,
    backend,
    createdIso,
    spec,
  })
}

/**
 * Builds a checkpoint archive at `destPath`: stages `checkpoint.json` and
 * an `artifact` file (written by `exportArtifact`, the backend's own
 * `exportCheckpoint` call) in a fresh temp directory, then tars exactly
 * those two members at the archive's root, removing the staging directory
 * on success and failure alike. `destPath`'s parent directories are created
 * first; a pre-existing file at `destPath` is overwritten (tar's default).
 */
export const writeCheckpointArchive = (
  destPath: string,
  metadata: CheckpointArchiveMetadata,
  exportArtifact: (artifactPath: string) => Effect.Effect<void, BackendError>,
): Effect.Effect<undefined, BackendError> =>
  Effect.tryPromise({
    try: () => fsp.mkdir(path.dirname(destPath), { recursive: true }),
    catch: (error) =>
      BackendError.make({
        message: `could not create checkpoint archive parent of '${destPath}': ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      }),
  }).pipe(
    Effect.flatMap(() =>
      Effect.acquireUseRelease(
        stagingDir('rightsize-checkpoint-export-', 'stage checkpoint archive'),
        (workDir): Effect.Effect<undefined, BackendError> =>
          Effect.gen(function*() {
            const artifactPath = path.join(workDir, 'artifact')
            yield* exportArtifact(artifactPath)
            yield* Effect.tryPromise({
              try: () => fsp.writeFile(path.join(workDir, 'checkpoint.json'), serializeManifest(metadata)),
              catch: (error) =>
                BackendError.make({
                  message: `could not write checkpoint.json: ${
                    error instanceof Error ? error.message : 'unknown error'
                  }`,
                }),
            })
            const result = yield* tarRun(
              TarCli.create(path.basename(destPath), workDir, ['checkpoint.json', 'artifact']),
              ARCHIVE_TAR_TIMEOUT_MS,
              path.dirname(destPath),
            )
            if (result.exitCode !== 0) {
              return yield* BackendError.make({
                message:
                  `tar could not create checkpoint archive '${destPath}' (exit ${result.exitCode}): ${result.stderr.trim()}`,
              })
            }
            return undefined
          }),
        (workDir) => removeTempDir(workDir),
      )
    ),
  )

/**
 * Extracts `srcPath` into a fresh temp dir, parses and validates
 * `checkpoint.json`, confirms the `artifact` member is present, then hands
 * both to `importArtifact` (the caller's own backend/registry validation
 * and `importCheckpoint` call) before the temp dir is removed. `srcPath`
 * not existing, not a valid tar, or missing its `checkpoint.json` or
 * `artifact` member each fail with `MalformedCheckpointArchiveError`
 * naming `srcPath`, before any backend call. The import callback's typed
 * rejections travel unchanged.
 */
export const readCheckpointArchive = <A, E, R>(
  srcPath: string,
  importArtifact: (metadata: CheckpointArchiveMetadata, artifactPath: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, MalformedCheckpointArchiveError | BackendError | E, R> =>
  Effect.acquireUseRelease(
    stagingDir('rightsize-checkpoint-import-', 'stage checkpoint import'),
    (workDir): Effect.Effect<A, MalformedCheckpointArchiveError | BackendError | E, R> =>
      Effect.tryPromise({
        try: () =>
          fsp.stat(srcPath).then(
            (stats) => {
              if (!stats.isFile()) {
                throw malformed(srcPath, 'the path is not a file')
              }
            },
            () => {
              throw malformed(srcPath, 'the file does not exist')
            },
          ).then(() =>
            runTar(TarCli.extract(path.basename(srcPath), workDir), ARCHIVE_TAR_TIMEOUT_MS, path.dirname(srcPath))
          ),
        catch: (error) => ioFailureOf(error),
      }).pipe(
        Effect.flatMap((extracted): Effect.Effect<A, MalformedCheckpointArchiveError | BackendError | E, R> => {
          if (extracted.exitCode !== 0) {
            return Effect.fail(malformed(srcPath, `not a valid tar archive: ${extracted.stderr.trim()}`))
          }
          return readManifestAndArtifact(workDir, srcPath).pipe(
            Effect.flatMap(({ metadata, artifactPath }) => importArtifact(metadata, artifactPath)),
          )
        }),
      ),
    (workDir) => removeTempDir(workDir),
  )

/** The extracted archive's manifest + artifact path — the parse is pure; missing members are typed. */
const readManifestAndArtifact = (
  workDir: string,
  srcPath: string,
): Effect.Effect<
  { readonly metadata: CheckpointArchiveMetadata; readonly artifactPath: string },
  MalformedCheckpointArchiveError | BackendError
> =>
  Effect.gen(function*() {
    const text = yield* Effect.tryPromise({
      try: () =>
        fsp.readFile(path.join(workDir, 'checkpoint.json'), 'utf8').then(
          (content) => content,
          () => {
            throw malformed(srcPath, 'missing checkpoint.json')
          },
        ),
      catch: (error) => ioFailureOf(error),
    })
    const parsed = parseCheckpointArchiveMetadata(text, srcPath)
    if (Result.isFailure(parsed)) {
      return yield* parsed.failure
    }
    const artifactPath = path.join(workDir, 'artifact')
    yield* Effect.tryPromise({
      try: () =>
        fsp.stat(artifactPath).then(
          () => undefined,
          () => {
            throw malformed(srcPath, 'missing artifact')
          },
        ),
      catch: (error) => ioFailureOf(error),
    })
    return { metadata: parsed.success, artifactPath }
  })
