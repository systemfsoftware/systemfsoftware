/**
 * The microsandbox checkpoint adapter — `CheckpointStore` over the msb
 * snapshot CLI. Behavioral source: upstream rightsize-node
 * `src/backend-msb/backend.ts` (Apache-2.0) `createCheckpoint` /
 * `removeCheckpoint` / `hasCheckpoint` / `exportCheckpoint` /
 * `importCheckpoint`.
 *
 * The stop/snapshot/reboot cycle: `msb stop`, `msb snapshot create --from
 * <name> <ref>` (a PATH ref — the `--dest-dir` shape every
 * `checkpointRef`-minted ref uses — writes the artifact at exactly
 * `<parent>/<basename>`), `msb rm`, then a fresh attached boot of the same
 * name from the snapshot (never `msb start` — the stopped disk state is
 * already in the snapshot). The reboot reuses the runtime's `start`, whose
 * retry policy handles the boot races; its name is untouched, so the
 * reaping ledger and `startedNames` stay consistent. The workload restarts
 * from scratch (the VM reboots) — `capabilities.checkpointRestartsWorkload`
 * is `true` on this backend.
 *
 * Ref semantics: a bare-name ref resolves through `msb snapshot inspect`
 * (exit 0 = exists, only the "snapshot not found" framing resolves
 * `false` — every other probe failure propagates); an absolute path ref is
 * answered by a plain filesystem check for `<ref>/snapshot.json`, and its
 * recursive removal is gated on `looksLikeCheckpointArtifactDir` so a
 * caller-supplied ref can never `rm -r` an arbitrary directory.
 *
 * Import derives the EFFECTIVE ref as the digest-derived directory name
 * from `msb snapshot load`'s own printed artifact path (never the archive's
 * recorded ref, never the `digest` field — live-verified: only the
 * digest-dir name resolves for `inspect`/`rm`/`run --from-snapshot`), then
 * CONFIRMS it present via `msb snapshot list --format json`.
 */
import { access, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { Effect } from 'effect'

import { BackendError, TmpfsRootCheckpointError } from '../model/errors.js'
import type { CheckpointStoreService, SandboxRuntimeService } from '../runtime/runtime.js'
import type { CommandRunnerService } from './command-runner.js'
import { MsbCommands } from './commands/msb.js'
import {
  confirmDigestDirNamePresent,
  isSnapshotAlreadyExistsError,
  isSnapshotNotFoundError,
  isSnapshotSaveAccessDeniedFailure,
  parseImportedDigestDirName,
  parseSnapshotList,
} from './output.js'

/** The `CheckpointStore` timing — generous, a snapshot's size tracks the sandbox's actual disk usage. */
export const CHECKPOINT_TIMEOUT_MS = 120_000

/** Snapshot refs minted by this backend are directories the checkpoint layer may safely recurse into. */
const CHECKPOINT_PREFIX = 'rz-ckpt-'

/** `true` when an absolute path ref is a checkpoint directory this backend itself would write. */
function looksLikeCheckpointArtifactDir(ref: string): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  if (!basename(ref).startsWith(CHECKPOINT_PREFIX)) {
    resolve(false)
    return promise
  }
  void access(join(ref, 'snapshot.json')).then(
    () => resolve(true),
    () => resolve(false),
  )
  return promise
}

/**
 * Completes the move msb's archive writer failed to reach on Windows (its
 * fsync of a read-only handle fails `ERROR_ACCESS_DENIED` every time in
 * 0.6.7/0.6.8, leaving a complete `.tar.zst` staged beside the destination).
 * Requires EXACTLY ONE staging file; anything else resolves `false` and the
 * caller surfaces msb's own error unchanged. Exercisable by unit tests on
 * any host — the platform gate lives at the call site.
 */
export function salvageStagedArchive(destFile: string): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const parent = dirname(destFile)
  const stagingPrefix = `.${basename(destFile)}.tmp.`
  void readdir(parent, { withFileTypes: true })
    .then((entries) =>
      entries
        .filter((entry) => entry.name.startsWith(stagingPrefix) && entry.isFile())
        .map((entry) => join(parent, entry.name))
    )
    .then((candidates) => {
      if (candidates.length !== 1) {
        resolve(false)
        return
      }
      const first = candidates[0]
      if (first === undefined) {
        resolve(false)
        return
      }
      // The single-candidate check above guarantees `first`; the guard is for the type system only.
      return rename(first, destFile).then(
        () => resolve(true),
        () => resolve(false),
      )
    })
    .catch(() => resolve(false))
  return promise
}

/** The `CheckpointStore` adapter over one runner + the runtime service (for stop/start). */
export function createMsbCheckpoints(
  runner: CommandRunnerService,
  runtime: SandboxRuntimeService,
): CheckpointStoreService {
  return {
    createCheckpoint: (handle, ref) =>
      Effect.gen(function*() {
        // Refused before touching the sandbox: a tmpfs root has nothing on
        // disk for a snapshot to capture, and stopping it first would gain
        // nothing.
        if (handle.spec.tmpfsRootMb !== undefined) {
          return yield* TmpfsRootCheckpointError.make()
        }
        yield* runtime.stop(handle)

        const isPathRef = isAbsolutePath(ref)
        if (isPathRef) {
          yield* Effect.tryPromise(() => mkdir(dirname(ref), { recursive: true }))
        }
        const snapshotArgv = isPathRef
          ? MsbCommands.snapshotCreate(handle.id, basename(ref), dirname(ref))
          : MsbCommands.snapshotCreate(handle.id, ref)
        const snapshot = yield* runner.invoke(snapshotArgv, CHECKPOINT_TIMEOUT_MS)
        if (snapshot.exitCode !== 0) {
          return yield* BackendError.make({
            message: `msb snapshot create --from ${handle.id} ${ref} failed (exit ${snapshot.exitCode}): ` +
              `${snapshot.stderr.trim()} — the sandbox is left stopped; run 'msb start ${handle.id}' by hand to ` +
              `bring it back up.`,
          })
        }

        yield* runner.invoke(MsbCommands.rm(handle.id), CHECKPOINT_TIMEOUT_MS).pipe(
          Effect.catchEager(() => Effect.void),
        )

        // Reboot from the snapshot under the same name — never `msb start`:
        // attached boot is the only mode that runs the image's ENTRYPOINT.
        yield* runtime.start({ id: handle.id, spec: { ...handle.spec, checkpointRef: ref } })
      }).pipe(
        Effect.catchEager((error) => rebootFailure(handle.id, ref, error.message)),
      ),
    removeCheckpoint: (ref) =>
      Effect.gen(function*() {
        const isPathRef = isAbsolutePath(ref)
        const name = isPathRef ? basename(ref) : ref
        yield* runner.invoke(MsbCommands.snapshotRemove(name), CHECKPOINT_TIMEOUT_MS).pipe(
          Effect.catchEager(() => Effect.void),
        )
        if (isPathRef && (yield* Effect.promise(() => looksLikeCheckpointArtifactDir(ref)))) {
          yield* Effect.tryPromise(() => rm(ref, { recursive: true, force: true })).pipe(
            Effect.catchEager(() => Effect.void),
          )
        }
      }),
    hasCheckpoint: (ref) =>
      Effect.gen(function*() {
        if (isAbsolutePath(ref)) {
          // A path ref names a directory msb itself wrote; presence is a
          // plain filesystem question, no msb call.
          const { promise, resolve } = Promise.withResolvers<boolean>()
          void access(join(ref, 'snapshot.json')).then(
            () => resolve(true),
            () => resolve(false),
          )
          return yield* Effect.promise(() => promise)
        }
        const result = yield* runner.invoke(MsbCommands.snapshotInspect(ref), CHECKPOINT_TIMEOUT_MS)
        if (result.exitCode === 0) {
          return true
        }
        if (isSnapshotNotFoundError(result.stderr)) {
          return false
        }
        return yield* BackendError.make({
          message: `msb snapshot inspect ${ref} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
        })
      }),
    exportCheckpoint: (ref, destFile) =>
      Effect.gen(function*() {
        const result = yield* runner.invoke(MsbCommands.snapshotExport(ref, destFile), CHECKPOINT_TIMEOUT_MS)
        if (result.exitCode === 0) {
          return
        }
        if (
          process.platform === 'win32' &&
          isSnapshotSaveAccessDeniedFailure(result.stderr) &&
          (yield* Effect.promise(() => salvageStagedArchive(destFile)))
        ) {
          return
        }
        return yield* BackendError.make({
          message: `msb snapshot save ${ref} ${destFile} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
        })
      }),
    importCheckpoint: (srcFile) =>
      Effect.gen(function*() {
        const imported = yield* runner.invoke(MsbCommands.snapshotImport(srcFile), CHECKPOINT_TIMEOUT_MS)
        let digestDirName: string | undefined
        if (imported.exitCode === 0) {
          digestDirName = parseImportedDigestDirName(imported.stdout)
        } else if (isSnapshotAlreadyExistsError(imported.stderr)) {
          digestDirName = parseImportedDigestDirName(imported.stderr)
        } else {
          return yield* BackendError.make({
            message: `msb snapshot load ${srcFile} failed (exit ${imported.exitCode}): ${imported.stderr.trim()}`,
          })
        }
        if (digestDirName === undefined) {
          return yield* BackendError.make({
            message:
              `msb snapshot load ${srcFile} did not print a recognizable artifact path — output:\n${imported.stdout}${imported.stderr}`,
          })
        }
        const list = yield* runner.invoke(MsbCommands.snapshotList(), CHECKPOINT_TIMEOUT_MS)
        if (list.exitCode !== 0) {
          return yield* BackendError.make({
            message: `msb snapshot list failed (exit ${list.exitCode}): ${list.stderr.trim()}`,
          })
        }
        const confirmed = confirmDigestDirNamePresent(parseSnapshotList(list.stdout), digestDirName)
        if (confirmed === undefined) {
          return yield* BackendError.make({
            message:
              `imported snapshot '${digestDirName}' from ${srcFile} did not appear in 'msb snapshot list' — could not confirm the import`,
          })
        }
        return confirmed
      }),
  }
}

/** The integration seam picks the failure from a cross-snapshot `error`-shaped channel. */
function isAbsolutePath(ref: string): boolean {
  return ref.startsWith('/') || ref.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(ref)
}

/** Wraps the reboot-from-snapshot failure into the checkpoint-naming error the recovery path points at. */
function rebootFailure(handleId: string, ref: string, detail: string): BackendError {
  return BackendError.make({
    message:
      `sandbox '${handleId}' was removed after a successful checkpoint snapshot, but booting a fresh sandbox back ` +
      `up from that snapshot failed: ${detail} — the sandbox's disk state is preserved in checkpoint '${ref}', ` +
      `restorable via GenericContainer.fromCheckpoint().`,
  })
}
