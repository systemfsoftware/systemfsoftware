/**
 * The reuse registry (R14) — the on-disk, cross-process record reuse'
 * adopt path reads (`<cacheDir>/reuse/<hash>.json`). Written atomically
 * after a reused container's first fresh boot passes its wait strategy;
 * read by every later `start()` (in this process or a later one) that
 * computes the same hash to decide whether to adopt instead of create.
 * Behavioral source: upstream rightsize-node `src/core/reuse/registry.ts`
 * (Apache-2.0) — every field is part of the cross-language contract.
 *
 * All operations are best-effort-reads and atomic-writes on the Effect
 * channel; nothing here throws synchronously.
 */
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { Effect } from 'effect'

import { writeFileAtomic } from '../internal/atomic-write.js'
import { BackendError } from '../model/errors.js'

/**
 * One `reuse/<hash>.json` record. Every field is part of the cross-language
 * contract — a Kotlin or Rust process must be able to parse exactly this
 * shape. `ports` is `{"<guestPort>": <hostPort>}` — JSON object keys are
 * always strings.
 */
export interface ReuseRegistryEntry {
  readonly name: string
  readonly image: string
  readonly ports: Record<string, number>
  readonly createdIso: string
  /** The backend that created this sandbox — informational; adopt always re-verifies liveness through the CURRENTLY active backend. */
  readonly backend: string
}

/** `<cacheDir>/reuse` — the directory every reuse registry file lives under. */
export const reuseDir = (cacheDir: string): string => path.join(cacheDir, 'reuse')

/** `reuse/<hash>.json`. */
export const reusePath = (cacheDir: string, hash: string): string => path.join(reuseDir(cacheDir), `${hash}.json`)

const isPortsRecord = (value: object): value is Record<string, number> => {
  if (Array.isArray(value)) {
    return false
  }
  for (const member of Object.values(value)) {
    if (typeof member !== 'number') {
      return false
    }
  }
  return true
}

/** Structural validator for a registry entry — a malformed record is `corrupt`, never trusted. */
export const isReuseRegistryEntry = (value: unknown): value is ReuseRegistryEntry => {
  if (typeof value !== 'object' || value === null || !('name' in value) || !('image' in value)) {
    return false
  }
  if (!('createdIso' in value) || !('backend' in value) || !('ports' in value)) {
    return false
  }
  const { name, image, createdIso, backend, ports } = value
  if (
    typeof name !== 'string' ||
    typeof image !== 'string' ||
    typeof createdIso !== 'string' ||
    typeof backend !== 'string'
  ) {
    return false
  }
  return typeof ports === 'object' && ports !== null && isPortsRecord(ports)
}

/**
 * The three outcomes reading a registry file can settle to — corrupt is
 * deliberately distinct from missing: the adopt path best-effort-cleans a
 * stale SANDBOX only for the former (a corrupt entry proves the identity
 * once existed), while a missing entry — the pure first-run case — removes
 * nothing unless the backend reports the name actually running (the
 * crash-mid-boot orphan guard).
 */
export type RegistryReadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'corrupt' }
  | { readonly kind: 'found'; readonly entry: ReuseRegistryEntry }

/**
 * Reads and parses `reuse/<hash>.json`. `"missing"` means the file does not
 * exist at all (the common "never created yet" case); `"corrupt"` means it
 * exists but isn't a well-shaped entry — malformed JSON or a
 * missing/mistyped required field. A file that cannot be READ is treated as
 * missing — the adopt path must never stall on a torn file system.
 */
export const readRegistry = (cacheDir: string, hash: string): Effect.Effect<RegistryReadResult> =>
  Effect.tryPromise(() =>
    fsp.readFile(reusePath(cacheDir, hash), 'utf8').then(
      (text) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          return { kind: 'corrupt' as const }
        }
        return isReuseRegistryEntry(parsed)
          ? { kind: 'found' as const, entry: parsed }
          : { kind: 'corrupt' as const }
      },
      () => ({ kind: 'missing' as const }),
    )
  )

// A per-process counter for temp-file suffixes — pid + counter is unique
// enough without a clock (the same convention as the reaping ledger).
let tmpCounter = 0

/**
 * Atomically writes `reuse/<hash>.json` (tmp file + rename, the same
 * protocol as the reaping ledger — shared writer, so a failed write also
 * unlinks its tmp file) — called once, after a fresh reuse container's wait
 * strategy has confirmed readiness. A concurrent reader only ever observes
 * either the previous complete file or this one, never a partial write.
 */
export const writeRegistryAtomic = (
  cacheDir: string,
  hash: string,
  entry: ReuseRegistryEntry,
): Effect.Effect<void, BackendError> =>
  Effect.tryPromise({
    try: () => {
      const dir = reuseDir(cacheDir)
      const target = reusePath(cacheDir, hash)
      tmpCounter += 1
      return writeFileAtomic(dir, target, `.${hash}.json.tmp-${process.pid}-${tmpCounter}`, entry)
    },
    catch: (error) =>
      BackendError.make({
        message: `could not write reuse registry entry '${hash}.json': ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      }),
  })

/** Best-effort delete of `reuse/<hash>.json`. A missing entry is not an error. */
export const removeRegistry = (cacheDir: string, hash: string): Effect.Effect<void> =>
  Effect.tryPromise(() => fsp.unlink(reusePath(cacheDir, hash)).catch(() => {})).pipe(
    Effect.catchEager(() => Effect.void),
  )
