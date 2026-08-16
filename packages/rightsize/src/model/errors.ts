/**
 * The typed error taxonomy — all 19 upstream tags preserved 1:1 as
 * `Schema.TaggedError`, enumerated from `src/core/errors.ts` at the fork
 * point (`TmpfsRootCheckpointError` included — renames are not permitted,
 * R4). Every class carries its upstream constructor fields, is matchable via
 * `Effect.catchTag` on its `_tag` (identical to the class name), and nothing
 * on this surface throws: errors are values, constructed and matched, never
 * raised by the domain combinators.
 *
 * Message text is the schema-backed default; the upstream em-dash rendering
 * conventions belong to the classification workflow that renders these
 * values (KTD6).
 */
import { Schema as S } from 'effect'
import { FiniteNumber } from './container-spec.schema.js'

/**
 * A requested capability is not supported by the active backend.
 *
 * `feature` stays a noun phrase ("network links", "read-only mount
 * enforcement") and advice lives in `remedy`.
 */
export class UnsupportedByBackendError extends S.TaggedError<UnsupportedByBackendError>()('UnsupportedByBackendError', {
  feature: S.String,
  backend: S.String,
  remedy: S.optionalKey(S.String),
}) {}

/**
 * A backend's `start()` failed because a chosen host port is already bound
 * by something else. The launch loop classifies this and retries with fresh
 * ports; it only escapes after every retry attempt is exhausted.
 */
export class PortBindConflictError extends S.TaggedError<PortBindConflictError>()('PortBindConflictError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}

/** A wait strategy never observed readiness before its deadline. */
export class ContainerLaunchError extends S.TaggedError<ContainerLaunchError>()('ContainerLaunchError', {
  message: S.String,
}) {}

/** A subprocess/daemon failure; message carries full stderr/body. */
export class BackendError extends S.TaggedError<BackendError>()('BackendError', {
  message: S.String,
}) {}

/** The msb toolchain provisioner cannot get a runnable `msb` binary in place (download, checksum, or lock failure). */
export class ProvisionError extends S.TaggedError<ProvisionError>()('ProvisionError', {
  message: S.String,
}) {}

/** `withReuse()` cannot be combined with `withNetwork()` — reuse's identity hash never covers network topology. */
export class ReuseWithNetworkError extends S.TaggedError<ReuseWithNetworkError>()('ReuseWithNetworkError', {}) {}

/** `withRequireIsolation()` demands hardware virtualization the active backend does not provide. */
export class IsolationRequiredError extends S.TaggedError<IsolationRequiredError>()('IsolationRequiredError', {
  backend: S.String,
}) {}

/** `checkpoint()` is not supported by the active backend's capabilities. */
export class CheckpointUnsupportedError
  extends S.TaggedError<CheckpointUnsupportedError>()('CheckpointUnsupportedError', {
    backend: S.String,
  })
{}

/** A checkpoint created on one backend is being restored under a different one. */
export class CheckpointBackendMismatchError
  extends S.TaggedError<CheckpointBackendMismatchError>()('CheckpointBackendMismatchError', {
    createdOnBackend: S.String,
    activeBackend: S.String,
  })
{}

/** `withReuse()` cannot be combined with `fromCheckpoint()` — reuse's identity hash never covers a checkpoint ref. */
export class ReuseFromCheckpointError
  extends S.TaggedError<ReuseFromCheckpointError>()('ReuseFromCheckpointError', {})
{}

/** A `containerPath` is not absolute — both backends require an absolute guest path. */
export class RelativeContainerPathError
  extends S.TaggedError<RelativeContainerPathError>()('RelativeContainerPathError', {
    containerPath: S.String,
  })
{}

/** A checkpoint name does not match `^[a-z0-9][a-z0-9-]{0,40}$`. */
export class InvalidCheckpointNameError
  extends S.TaggedError<InvalidCheckpointNameError>()('InvalidCheckpointNameError', {
    checkpointName: S.String,
  })
{}

/** The checkpoint's backend artifact no longer exists, so the checkpoint is stale and cannot be exported. */
export class CheckpointArtifactMissingError
  extends S.TaggedError<CheckpointArtifactMissingError>()('CheckpointArtifactMissingError', {
    ref: S.String,
    backend: S.String,
  })
{}

/** An explicitly supplied image's repository does not match the repository its module expects, with no override. */
export class IncompatibleImageError extends S.TaggedError<IncompatibleImageError>()('IncompatibleImageError', {
  suppliedRepository: S.String,
  expectedRepository: S.String,
}) {}

/** A checkpoint archive is not a well-formed rightsize archive. */
export class MalformedCheckpointArchiveError
  extends S.TaggedError<MalformedCheckpointArchiveError>()('MalformedCheckpointArchiveError', {
    archivePath: S.String,
    reason: S.String,
  })
{}

/** `withDiskLimit()` and `withTmpfsRoot()` are mutually exclusive — the root disk is size-capped or RAM-backed, not both. */
export class RootDiskConflictError extends S.TaggedError<RootDiskConflictError>()('RootDiskConflictError', {}) {}

/** `withTmpfsRoot()` exceeds an explicit `withMemoryLimit()` — a tmpfs root lives in guest memory and must fit inside it. */
export class TmpfsRootExceedsMemoryError
  extends S.TaggedError<TmpfsRootExceedsMemoryError>()('TmpfsRootExceedsMemoryError', {
    tmpfsMb: FiniteNumber,
    memoryMb: FiniteNumber,
  })
{}

/** A network-disabled container cannot join a network. */
export class NetworkDisabledConflictError
  extends S.TaggedError<NetworkDisabledConflictError>()('NetworkDisabledConflictError', {})
{}

/** A checkpoint is attempted on a container using a tmpfs root — ephemeral, nothing on disk for a snapshot to capture. */
export class TmpfsRootCheckpointError
  extends S.TaggedError<TmpfsRootCheckpointError>()('TmpfsRootCheckpointError', {})
{}
