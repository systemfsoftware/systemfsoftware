/**
 * Worker — wire types and failure identities for the child-process pool.
 *
 * Holds the JSON IPC alphabet, the four ways the host side can fail before
 * the worker is usable, and the two crash discriminants the engine branches on.
 */

import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

// ---------------------------------------------------------------------------
// IPC — method call / reply
// ---------------------------------------------------------------------------

/**
 * Method threw — the worker stayed up. Distinct from a crash: the pool
 * retires a crashed worker but not one whose method rejected.
 */
export class WorkerMethodError extends S.TaggedError<WorkerMethodError>()('WorkerMethodError', {
  message: Wire.mint(S.String),
  name: Wire.mint(S.optional(Wire.mint(S.String))),
  stack: Wire.mint(S.optional(Wire.mint(S.String))),
}) {}

// ---------------------------------------------------------------------------
// Process exit — crash discriminants
// ---------------------------------------------------------------------------

/**
 * A process identifier. `S.Int` rather than `S.Number` because the plain number
 * domain admits `NaN` and the infinities, and a pid is none of those.
 */
const ProcessId = Wire.mint(S.Int)

/**
 * How a child process ended.
 */
const ChildExit = Wire.mint(
  S.Union([
    Wire.wire({ _tag: Wire.mint(S.Literals(['Code'])), code: Wire.mint(S.Int) }),
    Wire.wire({ _tag: Wire.mint(S.Literals(['Signal'])), signal: Wire.mint(S.String) }),
  ]),
)
export type ChildExit = typeof ChildExit.Type

/**
 * The child process hosting a worker ended when it was not supposed to.
 */
export class ChildProcessCrashedError extends S.TaggedError<ChildProcessCrashedError>()(
  'ChildProcessCrashedError',
  {
    pid: ProcessId,
    exit: ChildExit,
    cause: Wire.mint(S.optional(Wire.mint(S.String))),
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
    byteLength: Wire.mint(S.Int),
    limit: Wire.mint(S.Int),
  },
) {
  readonly exitClass = 'InternalError' as const
}
export class OutOfMemoryError extends S.TaggedError<OutOfMemoryError>()('OutOfMemoryError', {
  pid: ProcessId,
  exitCode: Wire.mint(S.Int),
}) {
  readonly exitClass = 'RuntimeError' as const
}
