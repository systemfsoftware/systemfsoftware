/**
 * Checkpoint data — the public `Checkpoint` value and the pinned registry/
 * archive spec projection (R14).
 *
 * `CheckpointRegistrySpec` is the reduced, cross-language-pinned subset of
 * `ContainerSpec` a named checkpoint's registry entry and a checkpoint
 * archive's `checkpoint.json` carry — exactly the fields
 * `fromCheckpoint` reads back (env, command, exposed ports, memory
 * limit), never the rest (name, image, host ports, mounts, network
 * topology, `runId`, `keepAlive`). Field names and shapes are part of the
 * wire format, pinned identically in every rightsize language
 * implementation: `env` as a plain object (not an array of pairs, unlike
 * `ContainerSpec.env`), `command` as an array or `null` (never
 * `undefined` — JSON has no `undefined`), `exposedPorts` as guest ports
 * only.
 */
import type { ContainerSpec } from '../model/container-spec.js'

/** The reduced spec subset a checkpoint persists — see the module doc. */
export interface CheckpointRegistrySpec {
  readonly env: Record<string, string>
  readonly command: ReadonlyArray<string> | null
  readonly exposedPorts: ReadonlyArray<number>
  readonly memoryLimitMb: number | null
}

/** One `checkpoints/<name>.json` record — backend-tagged, cross-process readable. */
export interface CheckpointRegistryEntry {
  readonly name: string
  readonly ref: string
  /** The backend that created this checkpoint (`'docker'` | `'msb'`) — `find`/`remove` only probe/touch the artifact when this matches the CURRENTLY active backend. */
  readonly backend: string
  readonly createdIso: string
  readonly spec: CheckpointRegistrySpec
}

/**
 * A checkpoint: the backend-minted ref, the backend that minted it, and
 * the minimized spec a later restore is seeded from. `spec` is the data
 * `fromCheckpoint` reads — a full `ContainerSpec` shaped from the registry
 * projection's four meaningful fields plus stable placeholders.
 */
export interface Checkpoint {
  readonly ref: string
  readonly backend: string
  readonly spec: ContainerSpec
}
