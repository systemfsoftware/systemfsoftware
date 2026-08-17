/**
 * The `Checkpoints` surface (R14) — find/list/remove/exportTo/importFrom
 * over the on-disk named-checkpoint registry and the active backend's
 * `CheckpointStore`, plus the container-side `checkpoint` capture.
 * Behavioral source: upstream rightsize-node `src/core/checkpoint/api.ts`
 * (Apache-2.0).
 *
 * Every operation resolves the active backend through `Selection` and the
 * registry's home under the rightsize cache dir through `RightsizeConfig`,
 * so nothing here holds global mutable state — effects in, effects out.
 *
 * The registry records are backend-tagged: `find`/`remove` only probe or
 * touch the underlying artifact when the recorded backend matches the
 * CURRENTLY active one; a foreign-backend entry is returned (find) or its
 * record removed without touching the artifact (remove) — this library
 * never calls a backend that isn't active.
 */
import { Clock, Effect } from 'effect'

import {
  BackendError,
  CheckpointArtifactMissingError,
  CheckpointBackendMismatchError,
  CheckpointUnsupportedError,
  ContainerLaunchError,
  InvalidCheckpointNameError,
  MalformedCheckpointArchiveError,
  TmpfsRootCheckpointError,
  UnsupportedByBackendError,
} from '../model/errors.js'
import { cacheDirFromConfig, RightsizeConfig } from '../runtime/config.js'
import { CheckpointStore, SandboxRuntime } from '../runtime/runtime.js'
import type { SandboxHandle } from '../runtime/runtime.js'
import { Selection } from '../runtime/selection.workflow.js'
import { waitForReady, type WaitOptions } from '../wait/interpreter.js'
import { InvalidWaitStrategyError } from '../wait/verdict.js'
import { type CheckpointArchiveMetadata, readCheckpointArchive, writeCheckpointArchive } from './archive.js'
import { checkpointRef } from './checkpoint-ref.js'
import type { Checkpoint, CheckpointRegistryEntry } from './checkpoint.js'
import {
  fromCheckpointRegistryEntry,
  listCheckpointNames,
  readCheckpointRegistry,
  removeCheckpointRegistryFile,
  requireValidCheckpointName,
  toCheckpointRegistrySpec,
  writeCheckpointRegistryAtomic,
} from './registry.js'
import { isValidCheckpointName } from './registry.js'

/** The services every Checkpoints operation draws on. */
export type CheckpointServices = CheckpointStore | Selection | RightsizeConfig

/** The cache dir the registry lives under, resolved from `RightsizeConfig` (the same derivation the launch executor uses for hygiene). */
const rightCacheDir = Effect.gen(function*() {
  const config = yield* RightsizeConfig
  return cacheDirFromConfig(config)
})

/** `CheckpointRegistryEntry` → the public `Checkpoint` value (spec reconstructed from the pinned projection). */
const toCheckpoint = (entry: CheckpointRegistryEntry): Checkpoint => ({
  ref: entry.ref,
  backend: entry.backend,
  spec: fromCheckpointRegistryEntry(entry),
})

// =============================================================================
// find / list / remove
// =============================================================================

/**
 * Rediscovers a named checkpoint written by an earlier `checkpoint(name)`
 * call — in this process or an entirely different one, since the registry
 * lives on disk under the shared cache dir. No entry resolves to
 * `undefined`. A corrupt entry is treated as absent, with a best-effort
 * delete of the bad file.
 *
 * When the entry's recorded backend matches the CURRENTLY active backend,
 * the underlying artifact is probed via `hasCheckpoint` before this
 * resolves — an artifact that's gone makes the entry stale: it's
 * best-effort deleted and this resolves to `undefined`. A probe FAILURE
 * propagates (never swallowed into a `false`). When the recorded backend
 * DIFFERS, this returns the entry unprobed — `fromCheckpoint(...).start()`'s
 * own `CheckpointBackendMismatchError` gate stays the sole authority for
 * that mismatch.
 *
 * `name` is validated against the pinned pattern BEFORE anything else,
 * including before the registry file is even looked up.
 */
export const findCheckpoint = (
  name: string,
): Effect.Effect<Checkpoint | undefined, InvalidCheckpointNameError | BackendError, CheckpointServices> =>
  Effect.gen(function*() {
    const validated = yield* requireValidCheckpointName(name)
    const cacheDir = yield* rightCacheDir
    const read = yield* readCheckpointRegistry(cacheDir, validated)
    if (read.kind === 'missing') {
      return undefined
    }
    if (read.kind === 'corrupt') {
      yield* removeCheckpointRegistryFile(cacheDir, validated)
      return undefined
    }
    const entry = read.entry
    if (entry.backend !== (yield* Selection).backend) {
      return toCheckpoint(entry)
    }
    const exists = yield* (yield* CheckpointStore).hasCheckpoint(entry.ref)
    if (!exists) {
      yield* removeCheckpointRegistryFile(cacheDir, validated)
      return undefined
    }
    return toCheckpoint(entry)
  })

/** Every named checkpoint currently in the registry — registry contents only, never probed against a backend (unlike `find`), so a stale entry whose artifact is gone still appears here until something calls `find` or `remove` on it. A corrupt entry is silently skipped, never removed. */
export const listCheckpoints: Effect.Effect<ReadonlyArray<Checkpoint>, InvalidCheckpointNameError, RightsizeConfig> =
  Effect.gen(function*() {
    const cacheDir = yield* rightCacheDir
    const names = yield* listCheckpointNames(cacheDir)
    const checkpoints: Checkpoint[] = []
    for (const name of names) {
      if (!isValidCheckpointName(name)) {
        continue
      }
      const read = yield* readCheckpointRegistry(cacheDir, name)
      if (read.kind === 'found') {
        checkpoints.push(toCheckpoint(read.entry))
      }
    }
    return checkpoints
  })

/**
 * Deletes a named checkpoint: best-effort removal of the backend artifact
 * (ONLY when the entry's recorded backend matches the currently active
 * one) plus the registry file, regardless of order of failure in either.
 * Idempotent and always best-effort: "not found" anywhere is success,
 * reported as `false`; an existing entry — valid or corrupt — reports
 * `true` once its registry file is gone. A foreign-backend record leaves
 * the underlying artifact on disk permanently (never a call to a backend
 * that isn't active).
 */
export const removeCheckpoint = (
  name: string,
): Effect.Effect<boolean, InvalidCheckpointNameError | BackendError, CheckpointServices> =>
  Effect.gen(function*() {
    const validated = yield* requireValidCheckpointName(name)
    const cacheDir = yield* rightCacheDir
    const read = yield* readCheckpointRegistry(cacheDir, validated)
    if (read.kind === 'missing') {
      return false
    }
    if (read.kind === 'corrupt') {
      yield* removeCheckpointRegistryFile(cacheDir, validated)
      return true
    }
    const entry = read.entry
    const selection = yield* Selection
    if (entry.backend === selection.backend) {
      const store = yield* CheckpointStore
      yield* store.removeCheckpoint(entry.ref).pipe(Effect.catchEager(() => Effect.void))
    }
    yield* removeCheckpointRegistryFile(cacheDir, validated)
    return true
  })

// =============================================================================
// create — the container-side checkpoint capture
// =============================================================================

/** The create knobs — everything exists so tests script the recording doubles without real sockets. */
export interface CheckpointCreateOptions {
  /** Makes the checkpoint NAMED and durable (deterministic ref + a registry entry). Validated against the pinned pattern before anything else. */
  readonly name?: string | undefined
  /** The wait interpreter's knobs for the post-capture re-readiness (msb restarts the workload). */
  readonly wait?: WaitOptions | undefined
}

/**
 * Captures `handle`'s current state and returns a `Checkpoint` — a
 * FILESYSTEM capture, not a memory snapshot: `fromCheckpoint` boots a
 * container from the captured state with processes restarting from
 * scratch. Requires the backend's `capabilities.checkpoint` (checked
 * BEFORE any backend call — `CheckpointUnsupportedError`). A `name` makes
 * the checkpoint NAMED and durable: a deterministic ref and — only once
 * the backend call has succeeded — a registry entry `find`/`list`/`remove`
 * can rediscover. Checkpointing under a name that already has a registry
 * entry REPLACES it (best-effort removal of the old artifact under the
 * deterministic ref first; the latest checkpoint under a name wins).
 *
 * On a backend whose `capabilities.checkpointRestartsWorkload` is `true`
 * (msb: the stop/snapshot/reboot cycle boots a fresh microVM), this re-runs
 * the container's own wait strategy before returning — a bare return right
 * after the backend call would hand back a false-ready container. docker's
 * commit-to-image never disturbs the container, so no re-wait happens
 * there.
 */
export const checkpointContainer = (
  handle: SandboxHandle,
  options: CheckpointCreateOptions = {},
): Effect.Effect<
  Checkpoint,
  | InvalidCheckpointNameError
  | CheckpointUnsupportedError
  | TmpfsRootCheckpointError
  | BackendError
  | ContainerLaunchError
  | InvalidWaitStrategyError
  | UnsupportedByBackendError,
  CheckpointStore | Selection | RightsizeConfig | SandboxRuntime
> =>
  Effect.gen(function*() {
    if (options.name !== undefined) {
      yield* requireValidCheckpointName(options.name)
    }
    const runtime = yield* SandboxRuntime
    if (!runtime.capabilities.checkpoint) {
      return yield* CheckpointUnsupportedError.make({ backend: runtime.name })
    }
    // Hoisted ahead of the remove/registry/backend steps: a refused
    // re-checkpoint of a tmpfs-root container must not destroy the prior
    // artifact under the name (upstream's TmpfsRootCheckpointError order).
    if (handle.spec.tmpfsRootMb !== undefined && runtime.name === 'msb') {
      return yield* TmpfsRootCheckpointError.make()
    }
    const cacheDir = yield* rightCacheDir
    const ref = checkpointRef(runtime.name, options.name, cacheDir)
    const store = yield* CheckpointStore
    if (options.name !== undefined) {
      // Replace semantics: the ref is deterministic from the name, so the
      // prior checkpoint — under this exact ref — is best-effort cleared.
      yield* store.removeCheckpoint(ref).pipe(Effect.catchEager(() => Effect.void))
    }
    yield* store.createCheckpoint(handle, ref)
    if (runtime.capabilities.checkpointRestartsWorkload) {
      yield* waitForReady(handle, options.wait)
    }
    if (options.name !== undefined) {
      // Only after the backend capture succeeded — a failed call already
      // threw; a registry entry is never written for something that does
      // not exist.
      const entry: CheckpointRegistryEntry = {
        name: options.name,
        ref,
        backend: runtime.name,
        createdIso: yield* createdIso(),
        spec: toCheckpointRegistrySpec(handle.spec),
      }
      yield* writeCheckpointRegistryAtomic(cacheDir, options.name, entry).pipe(
        Effect.catchEager(() => Effect.void),
      )
    }
    return { ref, backend: runtime.name, spec: handle.spec }
  })

/** The ISO timestamp for registry entries — the Effect clock, never a live `Date` read. */
const createdIso = (): Effect.Effect<string> =>
  Effect.map(Clock.currentTimeMillis, (millis) =>
    // The one place a plain Date is the honest primitive: formatting an
    // epoch-ms instant as the ISO registry/archive timestamp.
    // @effect-diagnostics-next-line globalDate:off
    new Date(millis).toISOString())

// =============================================================================
// exportTo / importFrom — portable archives
// =============================================================================

/**
 * Reverse lookup: the registry entry (if any) whose `ref`/`backend` match a
 * `Checkpoint`'s own — `exportCheckpointArchive`'s only way to learn
 * whether the checkpoint it's given was ever named, and under what name. A
 * corrupt entry is silently skipped, matching `list`'s own tolerance.
 */
const findRegistryEntryByRef = (
  cacheDir: string,
  ref: string,
  backend: string,
): Effect.Effect<CheckpointRegistryEntry | undefined, InvalidCheckpointNameError> =>
  Effect.gen(function*() {
    const names = yield* listCheckpointNames(cacheDir)
    for (const name of names) {
      const read = yield* readCheckpointRegistry(cacheDir, name)
      if (read.kind === 'found' && read.entry.ref === ref && read.entry.backend === backend) {
        return read.entry
      }
    }
    return undefined
  })

/**
 * Bundles `cp` into a self-describing archive at `destPath`: `checkpoint.json`
 * (pinned metadata) plus an `artifact` member holding the backend's own
 * payload, byte-for-byte what `CheckpointStore.exportCheckpoint` produces.
 *
 * Requires the ACTIVE backend to equal `cp.backend` — the same
 * `CheckpointBackendMismatchError` a restore throws — before any backend or
 * filesystem work. Then probes the artifact still exists via
 * `hasCheckpoint`: exporting a stale checkpoint throws
 * `CheckpointArtifactMissingError` rather than producing a broken archive.
 * Works on an ephemeral (unnamed) checkpoint too — the archive then carries
 * `name: null`.
 */
export const exportCheckpointArchive = (
  cp: Checkpoint,
  destPath: string,
): Effect.Effect<
  undefined,
  CheckpointBackendMismatchError | CheckpointArtifactMissingError | InvalidCheckpointNameError | BackendError,
  CheckpointServices
> =>
  Effect.gen(function*() {
    const selection = yield* Selection
    if (cp.backend !== selection.backend) {
      return yield* CheckpointBackendMismatchError.make({
        createdOnBackend: cp.backend,
        activeBackend: selection.backend,
      })
    }
    const store = yield* CheckpointStore
    const exists = yield* store.hasCheckpoint(cp.ref)
    if (!exists) {
      return yield* CheckpointArtifactMissingError.make({ ref: cp.ref, backend: cp.backend })
    }

    const cacheDir = yield* rightCacheDir
    const registryEntry = yield* findRegistryEntryByRef(cacheDir, cp.ref, cp.backend)
    const metadata: CheckpointArchiveMetadata = {
      rightsizeArchive: 1,
      name: registryEntry?.name ?? null,
      ref: cp.ref,
      backend: cp.backend,
      createdIso: registryEntry?.createdIso ?? (yield* createdIso()),
      spec: toCheckpointRegistrySpec(cp.spec),
    }

    yield* writeCheckpointArchive(destPath, metadata, (artifactPath) => store.exportCheckpoint(cp.ref, artifactPath))
  })

/**
 * The inverse of `exportCheckpointArchive`: extracts `srcPath`, validates
 * its `checkpoint.json` (format version, `name` against the pinned pattern
 * when non-null, backend against the ACTIVE backend — a
 * `MalformedCheckpointArchiveError` or `CheckpointBackendMismatchError`
 * either way, BEFORE any backend call or registry write), then hands the
 * extracted `artifact` to `CheckpointStore.importCheckpoint`, which
 * materializes it and returns the EFFECTIVE ref (docker: the same `ref`
 * the archive recorded; microsandbox: the digest the import actually
 * assigned).
 *
 * A NAMED archive gets replace semantics matching `checkpoint(name)`: if a
 * registry entry already exists for that name under a DIFFERENT ref and its
 * recorded backend matches the active one, its old artifact is
 * best-effort removed first (never a foreign-backend call); the registry
 * entry is then written (or overwritten) with the effective ref. A NAMELESS
 * archive writes no registry entry — the returned `Checkpoint` is purely
 * ephemeral.
 */
export const importCheckpointArchive = (
  srcPath: string,
): Effect.Effect<
  Checkpoint,
  MalformedCheckpointArchiveError | InvalidCheckpointNameError | CheckpointBackendMismatchError | BackendError,
  CheckpointServices
> => readCheckpointArchive(srcPath, (metadata, artifactPath) => importArchiveContent(metadata, artifactPath))

/** The archive import body — backend validation, the store import, and the registry replace/write. */
const importArchiveContent = (
  metadata: CheckpointArchiveMetadata,
  artifactPath: string,
): Effect.Effect<
  Checkpoint,
  InvalidCheckpointNameError | CheckpointBackendMismatchError | BackendError,
  CheckpointServices
> =>
  Effect.gen(function*() {
    const selection = yield* Selection
    if (metadata.name !== null) {
      yield* requireValidCheckpointName(metadata.name)
    }
    if (metadata.backend !== selection.backend) {
      return yield* CheckpointBackendMismatchError.make({
        createdOnBackend: metadata.backend,
        activeBackend: selection.backend,
      })
    }

    const store = yield* CheckpointStore
    const effectiveRef = yield* store.importCheckpoint(artifactPath, metadata.ref)
    const spec = fromCheckpointRegistryEntry({
      name: metadata.name ?? '',
      ref: effectiveRef,
      backend: selection.backend,
      createdIso: metadata.createdIso,
      spec: metadata.spec,
    })

    if (metadata.name !== null) {
      const cacheDir = yield* rightCacheDir
      const existing = yield* readCheckpointRegistry(cacheDir, metadata.name)
      if (
        existing.kind === 'found' && existing.entry.ref !== effectiveRef && existing.entry.backend === selection.backend
      ) {
        yield* store.removeCheckpoint(existing.entry.ref).pipe(Effect.catchEager(() => Effect.void))
      }
      const entry: CheckpointRegistryEntry = {
        name: metadata.name,
        ref: effectiveRef,
        backend: selection.backend,
        createdIso: metadata.createdIso,
        spec: metadata.spec,
      }
      yield* writeCheckpointRegistryAtomic(cacheDir, metadata.name, entry).pipe(
        Effect.catchEager(() => Effect.void),
      )
    }

    return { ref: effectiveRef, backend: selection.backend, spec }
  })

// =============================================================================
// The Checkpoints surface
// =============================================================================

/**
 * The library's entry point for rediscovering, maintaining, and moving
 * NAMED checkpoints across processes — the `find(...) ?? seed()`
 * first-run/later-run pattern. Unnamed `checkpoint(name)`-less captures
 * never appear here; only a named capture writes a registry entry these
 * functions can find. Refs stay opaque throughout.
 */
export const Checkpoints = {
  /** Rediscovers a named checkpoint — see `findCheckpoint`. */
  find: findCheckpoint,
  /** Every named checkpoint currently in the registry — see `listCheckpoints`. */
  list: listCheckpoints,
  /** Deletes a named checkpoint — see `removeCheckpoint`. */
  remove: removeCheckpoint,
  /** Bundles a checkpoint into a portable archive — see `exportCheckpointArchive`. */
  exportTo: exportCheckpointArchive,
  /** Materializes a portable archive on this machine — see `importCheckpointArchive`. */
  importFrom: importCheckpointArchive,
}
