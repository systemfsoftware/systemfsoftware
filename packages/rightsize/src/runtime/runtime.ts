/**
 * The runtime service contracts — the four capability Tags (KTD2) plus the
 * data shapes they traffic in. One small core Tag (`SandboxRuntime`) plus
 * satellite Tags only where a second real implementation exists:
 *
 * - `SandboxRuntime`  — create/start/stop/remove/exec/logs/followLogs/
 *   copyToContainer/copyFromContainer/inspect/removeByName/findRunning
 *   (upstream's `SandboxBackend` surface, minus the pieces other Tags own);
 * - `VirtualNetworks` — ensureNetwork/removeNetwork/installNetworkLinks;
 * - `CheckpointStore` — the five checkpoint operations;
 * - `ImageRegistry`   — pull/inspect/import image.
 *
 * Two deliberate absences, per KTD2: upstream's `close()` is NOT a Tag
 * method — backend teardown is the backend Layer's release — and
 * `cleanupSync`/`reaperKillCommand` belong to the hygiene unit (U4), not
 * here.
 *
 * The Tags use `Context.Service`'s function form: the repository's
 * `ban-classes` gate refuses the class-extends form the AnthropicClient
 * pattern uses, and this RC's `Context.Service<Shape>("key")` yields the
 * identical key semantics (yieldable as an Effect, `Layer.effect`-compatible).
 */
import { Context, Effect } from 'effect'
import type { RuntimeCapabilities } from '../model/capabilities.schema.js'
import type { ContainerSpec, ExecRequest, ExecResult } from '../model/container-spec.schema.js'
import type { BackendError, PortBindConflictError } from '../model/errors.js'
import type { HealthStatus } from '../model/wait.schema.js'

/** The two backends this library can select between. */
export type BackendName = 'docker' | 'msb'

/** A backend-native opaque container reference: immutable id + spec. Mutable runtime state is keyed by `id` backend-side, never bolted onto the handle. */
export interface SandboxHandle {
  /** The backend-native container id (or name, for msb). */
  readonly id: string
  /** The spec the container was created from. */
  readonly spec: ContainerSpec
}

/** One network alias a container should be reachable under from a running sibling on the same network (upstream `NetworkLink`). */
export interface NetworkLink {
  /** The name the sibling should be reachable under. */
  readonly alias: string
  /** The sibling's exposed guest port. */
  readonly guestPort: number
  /** The sibling's host-side mapped port to tunnel/route traffic to. */
  readonly targetHostPort: number
}

/**
 * Owns the close mechanism for a live `followLogs` stream: stops delivery,
 * never flushes a trailing fragment — that only happens on the workload's
 * own natural end (upstream `FollowHandle`, R12's "close handle that never
 * flushes").
 */
export interface FollowHandle {
  /** Stops delivering further lines. Never flushes a trailing fragment. */
  readonly close: Effect.Effect<void>
}

/**
 * The result of `inspect` — the port-plan addition that carries a
 * container's health status through the runtime capability (the
 * capability-gated `ForHealthCheck` wait reads it, U5). Minimal by design:
 * the launch and wait workflows need existence, running state and health;
 * anything a backend reports beyond that stays backend-side.
 */
export interface ContainerInspect {
  /** `true` when the container exists on this backend at all. */
  readonly exists: boolean
  /** `true` when the container exists and its workload is running. */
  readonly running: boolean
  /** The docker health status when the container reports one; `undefined` for containers without a healthcheck or on backends without health inspection. */
  readonly health: HealthStatus | undefined
}

// =============================================================================
// SandboxRuntime
// =============================================================================

/** The core runtime Tag's service surface — see the module doc for the method-to-Tag assignment (KTD2). */
export interface SandboxRuntimeService {
  /** The backend's own name (`'docker'` or `'msb'`). */
  readonly name: BackendName
  /** This backend's execution-model capability flags, set once and never changed at runtime. */
  readonly capabilities: RuntimeCapabilities
  /** Allocate the backend-native container without starting it. Must not bind ports or run the workload yet. */
  create(spec: ContainerSpec): Effect.Effect<SandboxHandle, BackendError>
  /** Boot the workload. On a bind conflict, fail with `PortBindConflictError` so the launch retry loop can classify it. */
  start(handle: SandboxHandle): Effect.Effect<void, PortBindConflictError | BackendError>
  /** Best-effort stop; teardown callers swallow failures. */
  stop(handle: SandboxHandle): Effect.Effect<void, BackendError>
  /** Best-effort removal of the backend-native resource; teardown callers swallow failures. */
  remove(handle: SandboxHandle): Effect.Effect<void, BackendError>
  /** Run a one-shot command inside a running container and wait for it to exit. */
  exec(handle: SandboxHandle, request: ExecRequest): Effect.Effect<ExecResult, BackendError>
  /** Fetch everything logged so far (bounded tail), for a one-shot read. */
  logs(handle: SandboxHandle): Effect.Effect<string, BackendError>
  /** Stream log lines to `consumer` as they are produced, in order, with no duplicates; the returned handle stops delivery without flushing. */
  followLogs(handle: SandboxHandle, consumer: (line: string) => void): Effect.Effect<FollowHandle, BackendError>
  /** Copy a host file or directory into the guest — transfer only; `cp -r`-style destination naming, stderr-carrying failure. */
  copyToContainer(handle: SandboxHandle, hostPath: string, containerPath: string): Effect.Effect<void, BackendError>
  /** The reverse direction of `copyToContainer`. */
  copyFromContainer(handle: SandboxHandle, containerPath: string, hostPath: string): Effect.Effect<void, BackendError>
  /** The container's existence/state/health (the capability-gated health wait reads this). */
  inspect(handle: SandboxHandle): Effect.Effect<ContainerInspect, BackendError>
  /** Best-effort stop+remove by NAME (the reaper ledger only stores names); "not found" is silently fine. */
  removeByName(name: string): Effect.Effect<void, BackendError>
  /** Reuse's adopt path: a handle for a running container named `spec.name`, or `undefined` when not running. Never re-derives a spec from inspection; `spec` is embedded verbatim. */
  findRunning(spec: ContainerSpec): Effect.Effect<SandboxHandle | undefined, BackendError>
}

/**
 * The core runtime service Tag. Implementations are the backend adapters
 * (docker and msb); this unit only declares the contract they must satisfy.
 */
export class SandboxRuntime extends Context.Service<SandboxRuntime, SandboxRuntimeService>()(
  '@systemfsoftware/rightsize/runtime/runtime/SandboxRuntime',
) {}

// =============================================================================
// VirtualNetworks
// =============================================================================

/** The network service Tag: native bridge networks (docker) or tunnel emulation (msb). */
export interface VirtualNetworksService {
  /** Idempotently ensure a network with this id exists. */
  ensureNetwork(networkId: string): Effect.Effect<void, BackendError>
  /** Best-effort removal of a network created by `ensureNetwork`. */
  removeNetwork(networkId: string): Effect.Effect<void, BackendError>
  /** Default no-op on docker (native networks); an emulating backend wires its tunnels from the links. */
  installNetworkLinks(handle: SandboxHandle, links: ReadonlyArray<NetworkLink>): Effect.Effect<void, BackendError>
}

export class VirtualNetworks extends Context.Service<VirtualNetworks, VirtualNetworksService>()(
  '@systemfsoftware/rightsize/runtime/runtime/VirtualNetworks',
) {}

// =============================================================================
// CheckpointStore
// =============================================================================

/** The checkpoint service Tag — the five operations of upstream's checkpoint surface. */
export interface CheckpointStoreService {
  /** Capture `handle`'s state under `ref` (docker: commit-to-image; msb: disk snapshot via the CLI). Gated on `capabilities.checkpoint` before this is reached. */
  createCheckpoint(handle: SandboxHandle, ref: string): Effect.Effect<void, BackendError>
  /** Best-effort removal of a checkpoint identified by `ref`; "not found" is success. */
  removeCheckpoint(ref: string): Effect.Effect<void, BackendError>
  /** `true` exactly when the checkpoint artifact still exists; probe failures propagate. */
  hasCheckpoint(ref: string): Effect.Effect<boolean, BackendError>
  /** Writes the checkpoint's backend payload to `destFile`, byte-for-byte what the backend's own CLI produces. */
  exportCheckpoint(ref: string, destFile: string): Effect.Effect<void, BackendError>
  /** Materializes an exported archive and returns the EFFECTIVE ref to use from here on (not necessarily `ref`). */
  importCheckpoint(srcFile: string, ref: string): Effect.Effect<string, BackendError>
}

export class CheckpointStore extends Context.Service<CheckpointStore, CheckpointStoreService>()(
  '@systemfsoftware/rightsize/runtime/runtime/CheckpointStore',
) {}

// =============================================================================
// ImageRegistry
// =============================================================================

/** The image service Tag: pull/inspect/import image (KTD2). */
export interface ImageRegistryService {
  /** Ensure `ref` is present locally, pulling when missing. */
  pull(ref: string): Effect.Effect<void, BackendError>
  /** `true` when the image exists locally (docker's 200/404 inspect contract). */
  inspect(ref: string): Effect.Effect<boolean, BackendError>
  /** Materialize an image from a saved archive (docker load / msb's equivalent); a failure carries the tool's stderr. */
  importImage(archivePath: string): Effect.Effect<void, BackendError>
}

export class ImageRegistry extends Context.Service<ImageRegistry, ImageRegistryService>()(
  '@systemfsoftware/rightsize/runtime/runtime/ImageRegistry',
) {}
