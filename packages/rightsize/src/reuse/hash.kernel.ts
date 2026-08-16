/**
 * The reuse identity kernel (R14) — the pure half of reuse's content-hash
 * adoption: what part of a `ContainerSpec` busts reuse identity, the
 * canonical serialization that digest is taken over, and the deterministic
 * reuse container name.
 *
 * This is the cross-language contract of upstream rightsize-node's
 * `src/core/reuse/hash.ts` (Apache-2.0, behavioral source): a Kotlin or
 * Rust rightsize process hashing the "same" logical spec must reach the
 * identical digest, so every field here and the canonical form are part of
 * the wire format, not an implementation detail.
 *
 * The kernel is pure: copy-source file CONTENT hashing (the one I/O in the
 * identity) happens in the adapter (`hash.adapter.ts`); the kernel receives
 * digested copies and returns the exact serialization upstream's kernel
 * returns for the same inputs.
 */
import { createHash } from 'node:crypto'

import type { ContainerSpec } from '../model/container-spec.schema.js'

// =============================================================================
// The identity slice
// =============================================================================

/** One reuse-relevant copy: the guest destination (identity) + the host source (content). */
export interface ReuseCopy {
  readonly guestPath: string
  readonly hostPath: string
}

/**
 * The reuse-relevant subset of a container's spec — everything that busts
 * identity if it changes, and nothing else (host ports, the process's
 * `RunId`, network topology, and `readOnly` are all deliberately absent).
 */
export interface ReuseIdentity {
  readonly image: string
  /** Array of pairs, not a Map — mirrors `ContainerSpec.env`. Order does not affect the hash. */
  readonly env: ReadonlyArray<readonly [string, string]>
  /** `undefined` and `[]` hash identically — both mean "no command override". */
  readonly command: ReadonlyArray<string> | undefined
  /** Order does not affect the hash (canonicalized by sorting ascending). */
  readonly exposedPorts: ReadonlyArray<number>
  readonly memoryLimitMb: number | undefined
  /** Order does not affect the hash (canonicalized by sorting on `guestPath`). */
  readonly copies: ReadonlyArray<ReuseCopy>
  /** Treated exactly like `memoryLimitMb`: unset never affects the hash, a value always does. */
  readonly diskLimitMb: number | undefined
  /** Treated exactly like `memoryLimitMb`: unset never affects the hash, a value always does. */
  readonly tmpfsRootMb: number | undefined
  /** Treated exactly like `memoryLimitMb`: `false` never affects the hash, `true` always does. */
  readonly networkDisabled: boolean
}

/**
 * The spec projection — pure: reads nothing, copies nothing beyond the
 * identity-relevant slice. Mounts project to copies (every mount, read-only
 * or not — upstream hashes the same set); ports project to guest ports.
 */
export const reuseIdentityOf = (spec: ContainerSpec): ReuseIdentity => ({
  image: spec.image,
  env: spec.env,
  command: spec.command,
  exposedPorts: spec.ports.map((binding) => binding.guestPort),
  memoryLimitMb: spec.memoryLimitMb,
  copies: spec.mounts.map((mount) => ({ guestPath: mount.guestPath, hostPath: mount.hostPath })),
  diskLimitMb: spec.diskLimitMb,
  tmpfsRootMb: spec.tmpfsRootMb,
  networkDisabled: spec.networkDisabled,
})

// =============================================================================
// Canonical form
// =============================================================================

/** One copy's canonical entry: destination path + the content digest taken at hash time. */
export interface ReuseCopyDigest {
  readonly guestPath: string
  readonly sha256: string
}

/** The canonical serialization the digest is taken over — field order is part of the contract. */
export interface CanonicalReuseIdentity {
  readonly image: string
  readonly env: Record<string, string>
  readonly command: ReadonlyArray<string>
  readonly exposedPorts: ReadonlyArray<number>
  readonly memoryLimitMb: number | null
  readonly copies: ReadonlyArray<ReuseCopyDigest>
  // Omitted entirely (not present as null/false) when unset, so a spec that
  // never touches these three keeps hashing exactly as it did before they
  // existed — see the pinned cross-language vector in hash.test.ts.
  readonly diskLimitMb?: number
  readonly tmpfsRootMb?: number
  readonly networkDisabled?: true
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Builds the canonical form: env as an object with keys inserted in sorted
 * order (canonicalized by sorting on key), `command` normalized to `[]` when
 * unset, ports sorted ascending, `memoryLimitMb` normalized to `null` when
 * unset, and copies sorted by `guestPath`. `diskLimitMb`/`tmpfsRootMb`/
 * `networkDisabled` are appended only when set — a spec that never touches
 * them serializes identically to one from before these fields existed. Pure.
 */
export const canonicalReuseIdentity = (
  identity: ReuseIdentity,
  copyDigests: ReadonlyArray<ReuseCopyDigest>,
): CanonicalReuseIdentity => {
  const env: Record<string, string> = {}
  for (const [key, value] of [...identity.env].sort(([a], [b]) => compareStrings(a, b))) {
    env[key] = value
  }
  const copies = [...copyDigests].sort((a, b) => compareStrings(a.guestPath, b.guestPath))
  return {
    image: identity.image,
    env,
    command: identity.command ?? [],
    exposedPorts: [...identity.exposedPorts].sort((a, b) => a - b),
    memoryLimitMb: identity.memoryLimitMb ?? null,
    copies,
    ...(identity.diskLimitMb !== undefined ? { diskLimitMb: identity.diskLimitMb } : {}),
    ...(identity.tmpfsRootMb !== undefined ? { tmpfsRootMb: identity.tmpfsRootMb } : {}),
    ...(identity.networkDisabled ? { networkDisabled: true as const } : {}),
  }
}

// =============================================================================
// Digest + the deterministic name
// =============================================================================

/**
 * sha256 over the canonical JSON serialization, as a lowercase hex digest —
 * identical across every rightsize language implementation for the same
 * logical spec. No whitespace: plain `JSON.stringify` already produces none.
 */
export const digestReuseIdentity = (canonical: CanonicalReuseIdentity): string =>
  createHash('sha256').update(JSON.stringify(canonical)).digest('hex')

/**
 * The identity hash of a spec, given pre-digested copy contents — the
 * compose of `canonicalReuseIdentity` + `digestReuseIdentity`.
 */
export const reuseIdentityHash = (
  identity: ReuseIdentity,
  copyDigests: ReadonlyArray<ReuseCopyDigest>,
): string => digestReuseIdentity(canonicalReuseIdentity(identity, copyDigests))

/**
 * `rz-reuse-<first 12 hex chars of hash>` — the reuse sandbox naming
 * convention (upstream addendum): deterministic from the hash, so a later
 * process computing the same identity looks for exactly this name.
 */
export const reuseName = (hash: string): string => `rz-reuse-${hash.slice(0, 12)}`

// =============================================================================
// Registry port projection — the Record<guestPort-string, hostPort> shape
// =============================================================================

/**
 * `ReadonlyArray<PortBinding>` → the registry's `{"<guestPort>": <hostPort>}`
 * shape — JSON object keys are always strings, so the guest port is
 * stringified (upstream's cross-language pinned shape).
 */
export const portsToMappedRecord = (
  ports: ReadonlyArray<{ readonly guestPort: number; readonly hostPort: number }>,
): Record<string, number> => {
  const record: Record<string, number> = {}
  for (const binding of ports) {
    record[String(binding.guestPort)] = binding.hostPort
  }
  return record
}

/**
 * The inverse of `portsToMappedRecord` — the port bindings an adopted
 * container's spec carries, from a registry record's string keys.
 */
export const mappedRecordToBindings = (
  record: Record<string, number>,
): ReadonlyArray<{ readonly guestPort: number; readonly hostPort: number }> =>
  Object.entries(record).map(([guestPort, hostPort]) => ({
    guestPort: Number(guestPort),
    hostPort,
  }))
