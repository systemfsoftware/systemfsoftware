/**
 * The named-checkpoint registry (R14) — the on-disk, backend-tagged record
 * under `<cacheDir>/checkpoints/<name>.json`, written atomically only after
 * the backend checkpoint it describes has actually succeeded and read by
 * `Checkpoints.find`/`list`/`remove` in this process or a later one.
 * Behavioral source: upstream rightsize-node
 * `src/core/checkpoint/registry.ts` (Apache-2.0).
 *
 * Two layers with two different throw contracts:
 *
 * - every public entry validates `name` against the pinned pattern on the
 *   EFFECT channel (`InvalidCheckpointNameError`) BEFORE anything else, so
 *   a `../` name can never reach path construction;
 * - `checkpointRegistryPath` itself re-validates and throws the SAME typed
 *   error as a defensive invariant — the one function every registry
 *   read/write funnels through, so even a future caller that forgets its
 *   own boundary cannot mint a path that escapes `checkpoints/`. The
 *   Effect-side gates make the throw unreachable from the public surface.
 */
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { Effect } from 'effect'

import type { ContainerSpec } from '../model/container-spec.schema.js'
import { BackendError, InvalidCheckpointNameError } from '../model/errors.js'
import type { CheckpointRegistryEntry, CheckpointRegistrySpec } from './checkpoint.js'

/** The pinned checkpoint-name pattern (identical across every rightsize language implementation). */
export const CHECKPOINT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/

/** `true` when `name` matches the pinned pattern — a valid registry path segment. */
export const isValidCheckpointName = (name: string): boolean => CHECKPOINT_NAME_PATTERN.test(name)

/**
 * The Effect-side gate — the public name validation: `name` in, the same
 * name out on the succeed channel, or `InvalidCheckpointNameError` on the
 * fail channel, before any file or backend work.
 */
export const requireValidCheckpointName = (name: string): Effect.Effect<string, InvalidCheckpointNameError> =>
  isValidCheckpointName(name)
    ? Effect.succeed(name)
    : Effect.fail(InvalidCheckpointNameError.make({ checkpointName: name }))

/** `<cacheDir>/checkpoints` — the directory every named checkpoint's registry file lives under. */
export const checkpointsDir = (cacheDir: string): string => path.join(cacheDir, 'checkpoints')

/**
 * `checkpoints/<name>.json`. Validates `name` itself (throwing the typed
 * `InvalidCheckpointNameError` on a miss) rather than trusting callers —
 * this is the one function every registry read/write funnels through, and
 * the defensive check is what stands between a `../` name and a path that
 * escapes `checkpoints/` even if a future caller forgets its own gate.
 */
export const checkpointRegistryPath = (cacheDir: string, name: string): string => {
  if (!isValidCheckpointName(name)) {
    throw InvalidCheckpointNameError.make({ checkpointName: name })
  }
  return path.join(checkpointsDir(cacheDir), `${name}.json`)
}

/** A plain string-record (archive/registry `env`) — one concern of the spec validator. */
const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  for (const member of Object.values(value)) {
    if (typeof member !== 'string') {
      return false
    }
  }
  return true
}

/** A string array or `null` (archive/registry `command`). */
const isCommandShape = (value: unknown): value is ReadonlyArray<string> | null =>
  value === null || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))

/** A number array (archive/registry `exposedPorts`). */
const isNumberArray = (value: unknown): value is ReadonlyArray<number> =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'number')

/** Structural validator for `CheckpointRegistrySpec` — also the shape a checkpoint archive's `checkpoint.json` `spec` field must match. */
export const isCheckpointRegistrySpec = (value: unknown): value is CheckpointRegistrySpec => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('env' in value) || !('command' in value) || !('exposedPorts' in value) || !('memoryLimitMb' in value)) {
    return false
  }
  const { env, command, exposedPorts, memoryLimitMb } = value
  return (
    isStringRecord(env) &&
    isCommandShape(command) &&
    isNumberArray(exposedPorts) &&
    (memoryLimitMb === null || typeof memoryLimitMb === 'number')
  )
}

const isCheckpointRegistryEntry = (value: unknown): value is CheckpointRegistryEntry => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (
    !('name' in value) || !('ref' in value) || !('backend' in value) || !('createdIso' in value) || !('spec' in value)
  ) {
    return false
  }
  const { name, ref, backend, createdIso, spec } = value
  return (
    typeof name === 'string' &&
    typeof ref === 'string' &&
    typeof backend === 'string' &&
    typeof createdIso === 'string' &&
    isCheckpointRegistrySpec(spec)
  )
}

/** The three outcomes reading a registry file can settle to — corrupt is deliberately distinct from missing. */
export type CheckpointRegistryReadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'corrupt' }
  | { readonly kind: 'found'; readonly entry: CheckpointRegistryEntry }

/**
 * Reads and parses `checkpoints/<name>.json`. `"missing"` means the file
 * does not exist; `"corrupt"` means it exists but isn't well-shaped. An
 * invalid `name` surfaces as `InvalidCheckpointNameError` on the error
 * channel — the path is validated before any file read.
 */
export const readCheckpointRegistry = (
  cacheDir: string,
  name: string,
): Effect.Effect<CheckpointRegistryReadResult, InvalidCheckpointNameError> =>
  requireValidCheckpointName(name).pipe(
    Effect.flatMap((validated) =>
      Effect.promise(() =>
        fsp.readFile(checkpointRegistryPath(cacheDir, validated), 'utf8').then(
          (text) => {
            let parsed: unknown
            try {
              parsed = JSON.parse(text)
            } catch {
              return { kind: 'corrupt' as const }
            }
            return isCheckpointRegistryEntry(parsed)
              ? { kind: 'found' as const, entry: parsed }
              : { kind: 'corrupt' as const }
          },
          () => ({ kind: 'missing' as const }),
        )
      )
    ),
  )

// A per-process counter for temp-file suffixes — pid + counter is unique
// enough without a clock (the same convention as the reaping ledger).
let tmpCounter = 0

/**
 * Atomically writes `checkpoints/<name>.json` (tmp file + rename) — called
 * only after the backend checkpoint this entry describes has succeeded.
 */
export const writeCheckpointRegistryAtomic = (
  cacheDir: string,
  name: string,
  entry: CheckpointRegistryEntry,
): Effect.Effect<void, InvalidCheckpointNameError | BackendError> =>
  requireValidCheckpointName(name).pipe(
    Effect.flatMap((validated) =>
      Effect.tryPromise({
        try: () => {
          const dir = checkpointsDir(cacheDir)
          const target = checkpointRegistryPath(cacheDir, validated)
          tmpCounter += 1
          const tmp = path.join(dir, `.${validated}.json.tmp-${process.pid}-${tmpCounter}`)
          return fsp
            .mkdir(dir, { recursive: true })
            .then(() => fsp.writeFile(tmp, JSON.stringify(entry)))
            .then(() => fsp.rename(tmp, target))
        },
        catch: (error) =>
          BackendError.make({
            message: `could not write checkpoint registry entry '${name}.json': ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          }),
      })
    ),
  )

/** Best-effort delete of `checkpoints/<name>.json`. A file already gone is not an error. */
export const removeCheckpointRegistryFile = (cacheDir: string, name: string): Effect.Effect<void> =>
  Effect.tryPromise(() => fsp.unlink(checkpointRegistryPath(cacheDir, name)).catch(() => {})).pipe(
    Effect.catchEager(() => Effect.void),
  )

/**
 * Every checkpoint name with a registry file on disk, derived from the
 * directory listing itself — includes corrupt files; `list` filters those
 * out after reading each one. Atomic-write tmp files
 * (`.<name>.json.tmp-…`) sort before their targets thanks to the leading
 * dot and are never real entries. The directory missing is an empty list.
 */
export const listCheckpointNames = (cacheDir: string): Effect.Effect<ReadonlyArray<string>> =>
  Effect.tryPromise(() =>
    fsp.readdir(checkpointsDir(cacheDir)).then(
      (entries) =>
        entries
          .filter((file) => file.endsWith('.json') && !file.startsWith('.'))
          .map((file) => file.slice(0, -'.json'.length)),
      () => [],
    )
  )

// =============================================================================
// Projections — full ContainerSpec ⇄ the pinned registry spec
// =============================================================================

/** The write-side projection: `handle.spec` down to the reduced, pinned shape. `undefined` fields normalize to `null`; ports keep only the guest side (a later restore allocates fresh host ports). */
export const toCheckpointRegistrySpec = (spec: ContainerSpec): CheckpointRegistrySpec => {
  const env: Record<string, string> = {}
  for (const [key, value] of spec.env) {
    env[key] = value
  }
  return {
    env,
    command: spec.command ?? null,
    exposedPorts: spec.ports.map((binding) => binding.guestPort),
    memoryLimitMb: spec.memoryLimitMb ?? null,
  }
}

/**
 * The read-side counterpart: reconstructs a `ContainerSpec`-shaped object
 * from a persisted entry, for handing back as a `Checkpoint`'s `spec`.
 * Only the four fields `fromCheckpoint` reads carry real information; every
 * other field is a stable placeholder, and keys the registry never persists
 * are omitted entirely (exact optional keys). `checkpointRef` points at the
 * entry's own ref — the wire a live backend hands back after a reboot.
 */
export const fromCheckpointRegistryEntry = (entry: CheckpointRegistryEntry): ContainerSpec => ({
  name: entry.name,
  image: entry.ref,
  env: Object.entries(entry.spec.env),
  ...(entry.spec.command === null ? {} : { command: entry.spec.command }),
  ports: entry.spec.exposedPorts.map((guestPort) => ({ hostPort: 0, guestPort })),
  mounts: [],
  aliases: [],
  runId: '',
  ...(entry.spec.memoryLimitMb === null ? {} : { memoryLimitMb: entry.spec.memoryLimitMb }),
  keepAlive: false,
  checkpointRef: entry.ref,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
})
