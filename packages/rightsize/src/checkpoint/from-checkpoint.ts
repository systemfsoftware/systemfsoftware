/**
 * `fromCheckpoint` — the restore-side spec wiring (R14): a `Checkpoint`
 * value into the `ContainerSpec` a launch boots, plus the launch-option
 * seam that tells the launch workflow which backend minted the ref
 * (`LaunchOptions.checkpointSourceBackend`). Behavioral source: upstream
 * rightsize-node `GenericContainer.fromCheckpoint` (Apache-2.0).
 *
 * The restored spec's IMAGE is the checkpoint's ref (`rightsize/checkpoint:
 * <name>` on docker — the committed image the restore boots; an
 * absolute snapshot path on msb, which the backend's `--from-snapshot`
 * wire reads from `spec.checkpointRef`), and env/command/exposed
 * ports/memory limit default to `cp.spec` — the captured state already has
 * the filesystem baked in. Network topology and mounts are NEVER carried
 * into a restore, matching what a capture persists (and the same spirit as
 * reuse's network restriction): the captured state is the restore.
 *
 * `start()`-side validation is the launch workflow's job: a
 * `checkpointSourceBackend` differing from the active backend is
 * `CheckpointBackendMismatchError` before any backend call, and a
 * `keepAlive` restore is `ReuseFromCheckpointError` under active reuse.
 */
import type { ContainerSpec } from '../model/container-spec.schema.js'
import type { Checkpoint } from './checkpoint.js'

/** A restore-ready launch: the spec to start, and the option seam its source backend rides on. */
export interface CheckpointRestoreLaunch {
  /** The spec to hand `launchContainer` (or a facade `start()`). */
  readonly spec: ContainerSpec
  /**
   * The backend that minted the checkpoint — pass as
   * `LaunchOptions.checkpointSourceBackend` so the launch workflow can
   * enforce `CheckpointBackendMismatchError` pre-I/O.
   */
  readonly sourceBackend: string
}

/**
 * Builds the restore spec for `cp`: image = the checkpoint ref, env/
 * command/ports (guest side, fresh host allocation)/memory from `cp.spec`,
 * `checkpointRef` pointing at itself. The caller's further `with*` calls
 * apply on top (a different `waitingFor`, a `withStartupTimeout`, …).
 */
export const fromCheckpoint = (cp: Checkpoint): ContainerSpec => ({
  name: cp.spec.name,
  image: cp.ref,
  env: cp.spec.env,
  ...(cp.spec.command === undefined ? {} : { command: cp.spec.command }),
  ...(cp.spec.entrypoint === undefined ? {} : { entrypoint: cp.spec.entrypoint }),
  ...(cp.spec.workingDir === undefined ? {} : { workingDir: cp.spec.workingDir }),
  ports: cp.spec.ports.map((binding) => ({ guestPort: binding.guestPort, hostPort: 0 })),
  mounts: [],
  aliases: [],
  runId: '',
  ...(cp.spec.memoryLimitMb === undefined ? {} : { memoryLimitMb: cp.spec.memoryLimitMb }),
  keepAlive: false,
  checkpointRef: cp.ref,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: cp.spec.waitStrategy,
  ...(cp.spec.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: cp.spec.startupTimeoutMs }),
})

/**
 * The composite restore launch: the spec plus the `checkpointSourceBackend`
 * seam value — the one-call shape for
 * `launchContainer(fromCheckpoint(cp).spec, { checkpointSourceBackend: launch.sourceBackend })`.
 */
export const restoreFromCheckpoint = (cp: Checkpoint): CheckpointRestoreLaunch => ({
  spec: fromCheckpoint(cp),
  sourceBackend: cp.backend,
})
