/**
 * Worker — wire types and failure identities for the child-process pool.
 *
 * Holds the JSON IPC alphabet, the four ways the host side can fail before
 * the worker is usable, and the two crash discriminants the engine branches on.
 */

import { Schema as S } from 'effect'

// ---------------------------------------------------------------------------
// IPC — method call / reply
// ---------------------------------------------------------------------------

/**
 * Method threw — the worker stayed up. Distinct from a crash: the pool
 * retires a crashed worker but not one whose method rejected.
 */
export class WorkerMethodError extends S.TaggedError<WorkerMethodError>()('WorkerMethodError', {
  message: S.String,
  name: S.optional(S.String),
  stack: S.optional(S.String),
}) {}

// ---------------------------------------------------------------------------
// Process exit — crash discriminants
// ---------------------------------------------------------------------------

/**
 * A process identifier. `S.Int` rather than `S.Number` because the plain number
 * domain admits `NaN` and the infinities, and a pid is none of those.
 */
const ProcessId = S.Int

/**
 * How a child process ended.
 */
const ChildExit = S.Union([
  S.Struct({ _tag: S.Literals(['Code']), code: S.Int }),
  S.Struct({ _tag: S.Literals(['Signal']), signal: S.String }),
])

export type ChildExit = typeof ChildExit.Type

/**
 * The child process hosting a worker ended when it was not supposed to.
 */
export class ChildProcessCrashedError extends S.TaggedError<ChildProcessCrashedError>()(
  'ChildProcessCrashedError',
  {
    pid: ProcessId,
    exit: ChildExit,
    cause: S.optional(S.String),
  },
) {
  readonly exitClass = 'InternalError' as const
}

/**
 * An IPC frame exceeded the maximum allowed size before a delimiter was seen.
 *
 * Distinct from a crash or OOM: the peer violated the framing contract and the
 * socket is closed to prevent unbounded string accumulation. Callers observe
 * this rather than a generic {@link ChildProcessCrashedError} so the cause is
 * distinguishable from an ordinary worker death.
 */
export class WorkerFrameTooLargeError extends S.TaggedError<WorkerFrameTooLargeError>()(
  'WorkerFrameTooLargeError',
  {
    byteLength: S.Int,
    limit: S.Int,
  },
) {
  readonly exitClass = 'InternalError' as const
}
export class OutOfMemoryError extends S.TaggedError<OutOfMemoryError>()('OutOfMemoryError', {
  pid: ProcessId,
  exitCode: S.Int,
}) {
  readonly exitClass = 'RuntimeError' as const
}
