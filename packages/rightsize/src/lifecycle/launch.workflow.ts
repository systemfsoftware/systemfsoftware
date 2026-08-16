/**
 * Launch validation — the pre-I/O decision step of the launch flow (F1,
 * R4, R5, KTD6).
 *
 * Every rejection upstream raises inside `start()`'s pre-I/O guard section
 * is a typed result of this workflow, not a throw (KTD6): the composing
 * executor distills the recorded facts — the final spec, the resolved
 * backend and its capabilities, the reuse double-opt-in, the module gate's
 * expected repository, and the checkpoint's source backend — into the
 * closed `LaunchCommand` union, and this workflow decides whether the spec
 * may reach any backend call. Nothing here performs I/O: a command in, a
 * `Result` out, no services, no config, no environment reads.
 *
 * The rejection order mirrors upstream `GenericContainer.start()` at the
 * fork point, so a spec carrying several simultaneous violations reports
 * the same one upstream would:
 *
 * 1. root-disk/network conflicts — `RootDiskConflictError`,
 *    `TmpfsRootExceedsMemoryError`, `NetworkDisabledConflictError`
 *    (`withDiskLimit` vs `withTmpfsRoot`, a RAM root that outgrows the
 *    memory ceiling, `withNetworkDisabled` + `withNetwork`);
 * 2. checkpoint/backend mismatch — `CheckpointBackendMismatchError`: a
 *    checkpoint ref is only meaningful to the backend that minted it;
 * 3. the isolation demand — `IsolationRequiredError` when the spec demands
 *    hardware isolation and the active backend's capabilities cannot
 *    provide it;
 * 4. the reuse gate — `ReuseWithNetworkError` / `ReuseFromCheckpointError`
 *    under the double opt-in (`withReuse()` AND `RIGHTSIZE_REUSE`): reuse's
 *    identity hash never covers network topology or a checkpoint ref;
 * 5. the module image gate — `IncompatibleImageError` via
 *    `requireCompatibleImage`, exactly when a module preset declared an
 *    expected repository.
 *
 * Only a spec that clears every gate yields `LaunchValidated`, which the
 * executor treats as the go-ahead to proceed to allocation and backend
 * calls (the effectful half of F1).
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

import type { RuntimeCapabilities } from '../model/capabilities.schema.js'
import type { ContainerSpec } from '../model/container-spec.schema.js'
import { requireCompatibleImage } from '../model/docker-image-name.js'
import {
  CheckpointBackendMismatchError,
  IncompatibleImageError,
  IsolationRequiredError,
  NetworkDisabledConflictError,
  ReuseFromCheckpointError,
  ReuseWithNetworkError,
  RootDiskConflictError,
  TmpfsRootExceedsMemoryError,
} from '../model/errors.js'
import type { BackendName } from '../runtime/runtime.js'

// ========================= Events =========================

/** Launch validation passed — the spec is safe to hand to a backend. */
export class LaunchValidated extends S.TaggedClass<LaunchValidated>()('LaunchValidated', {}) {}

/** The closed decision space of the launch-validation workflow. */
export type LaunchDecision = LaunchValidated

/**
 * Every rejection the launch-validation workflow can return, as its tag
 * union. All members are `Schema.TaggedError`s from the shared taxonomy
 * (R4), so consumers can `catchTag`/`Error.isType` on them everywhere.
 */
export type LaunchError =
  | RootDiskConflictError
  | TmpfsRootExceedsMemoryError
  | NetworkDisabledConflictError
  | CheckpointBackendMismatchError
  | IsolationRequiredError
  | ReuseWithNetworkError
  | ReuseFromCheckpointError
  | IncompatibleImageError

// ========================= command =========================

/**
 * The recorded facts launch-validation runs on, distilled by the composing
 * executor into a closed union. Every field is observed data — the
 * executor already performed whatever reads each one required (config,
 * backend resolution, modules lookup) before invoking this workflow.
 */
export type LaunchCommand = {
  readonly _tag: 'ValidateLaunch'
  /** The final spec, exactly as the executor would hand it to a backend. */
  readonly spec: ContainerSpec
  /** The backend this launch resolved to ('docker' | 'msb'). */
  readonly backend: BackendName
  /** The active backend's capability flags the isolation demand gates on. */
  readonly capabilities: RuntimeCapabilities
  /** `true` when the caller invoked the reuse marker (`withReuse()`-style API intent). Half of the double opt-in. */
  readonly reuseRequested: boolean
  /** `true` when `RIGHTSIZE_REUSE` is enabled. The other half of the double opt-in. */
  readonly reuseEnabled: boolean
  /**
   * The repository a module preset expects the spec's image to declare
   * (`ModulePreset.expectedRepository`); `undefined` for a plain,
   * non-module container — no image gate applies then.
   */
  readonly expectedRepository: string | undefined
  /**
   * The backend that minted the spec's `checkpointRef`, when the spec
   * came from `fromCheckpoint()`; `undefined` for every ordinary
   * container. A mismatch with `backend` is `CheckpointBackendMismatchError`
   * before any backend call (upstream's restore guard).
   */
  readonly checkpointSourceBackend: string | undefined
}

// ========================= kernels =========================

/** Root-disk/network conflicts — upstream's `validateSpecConflicts` (see the module doc for the order). */
const validateConflicts = (
  spec: ContainerSpec,
): Result.Result<void, RootDiskConflictError | TmpfsRootExceedsMemoryError | NetworkDisabledConflictError> => {
  if (spec.diskLimitMb !== undefined && spec.tmpfsRootMb !== undefined) {
    return Result.fail(RootDiskConflictError.make())
  }
  if (spec.tmpfsRootMb !== undefined && spec.memoryLimitMb !== undefined && spec.tmpfsRootMb > spec.memoryLimitMb) {
    return Result.fail(
      TmpfsRootExceedsMemoryError.make({ tmpfsMb: spec.tmpfsRootMb, memoryMb: spec.memoryLimitMb }),
    )
  }
  if (spec.networkDisabled && spec.networkId !== undefined) {
    return Result.fail(NetworkDisabledConflictError.make())
  }
  return Result.void
}

/** A checkpoint ref is only meaningful to the backend that minted it. */
const validateCheckpointBackend = (
  command: Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>,
): Result.Result<void, CheckpointBackendMismatchError> => {
  const source = command.checkpointSourceBackend
  if (source !== undefined && source !== command.backend) {
    return Result.fail(
      CheckpointBackendMismatchError.make({ createdOnBackend: source, activeBackend: command.backend }),
    )
  }
  return Result.void
}

/** `withRequireIsolation()` demands hardware isolation the backend may not provide. */
const validateIsolation = (
  command: Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>,
): Result.Result<void, IsolationRequiredError> => {
  if (command.spec.requireIsolation && !command.capabilities.hardwareIsolated) {
    return Result.fail(IsolationRequiredError.make({ backend: command.backend }))
  }
  return Result.void
}

/**
 * The reuse gate — active only under the double opt-in (marker AND
 * `RIGHTSIZE_REUSE`), exactly as upstream engages reuse. A spec whose
 * mutation set the mere `withKeepAlive` boolean but never the reuse marker
 * does not trip either rejection.
 */
const validateReuseGate = (
  command: Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>,
): Result.Result<void, ReuseWithNetworkError | ReuseFromCheckpointError> => {
  if (!(command.reuseRequested && command.reuseEnabled)) {
    return Result.void
  }
  if (command.spec.networkId !== undefined) {
    return Result.fail(ReuseWithNetworkError.make())
  }
  if (command.spec.checkpointRef !== undefined) {
    return Result.fail(ReuseFromCheckpointError.make())
  }
  return Result.void
}

/** The module image gate — `requireCompatibleImage` decides; the gate is skipped when no module declared an expected repository. */
const validateImageCompatibility = (
  command: Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>,
): Result.Result<void, IncompatibleImageError> => {
  const expected = command.expectedRepository
  if (expected === undefined) {
    return Result.void
  }
  const compat = requireCompatibleImage(command.spec.image, expected)
  return Result.isFailure(compat) ? Result.fail(compat.failure) : Result.void
}

/** The sequential validation pipeline — rejection short-circuits in the upstream order. */
const validateLaunch = (
  command: Extract<LaunchCommand, { readonly _tag: 'ValidateLaunch' }>,
): Result.Result<void, LaunchError> =>
  validateConflicts(command.spec).pipe(
    Result.flatMap(() => validateCheckpointBackend(command)),
    Result.flatMap(() => validateIsolation(command)),
    Result.flatMap(() => validateReuseGate(command)),
    Result.flatMap(() => validateImageCompatibility(command)),
  )

/** The base dispatch — pure, in-file; the workflow body is this single exhaustive call. */
const dispatchLaunch = (command: LaunchCommand): Result.Result<LaunchDecision, LaunchError> =>
  Match.exhaustive(
    Match.value(command).pipe(
      Match.tag('ValidateLaunch', (c) => validateLaunch(c).pipe(Result.map(() => LaunchValidated.make()))),
    ),
  )

/**
 * The launch-validation decision, authored at the `Workflow.make` boundary
 * (KTD3). The body is a single dispatch over the closed command union; the
 * workflow performs zero I/O — a pure function from recorded facts to a
 * typed `Result`.
 */
export const decideLaunch = Workflow.make(
  (command: LaunchCommand): Result.Result<LaunchDecision, LaunchError> => dispatchLaunch(command),
)
