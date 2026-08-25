import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

/**
 * A process identifier. `S.Int` rather than `S.Number` because the plain number
 * domain admits `NaN` and the infinities, and a pid is none of those — a
 * decoder that accepts `NaN` here would hand a killer an unusable target.
 */
const ProcessId = S.Int

/**
 * How a child process ended.
 *
 * Node's `exit` event yields `(code, signal)` with exactly one of them
 * non-null, so a record carrying both as required members makes two illegal
 * states constructable — a crash with both, and a crash with neither. The union
 * makes the choice unrepresentable rather than validating it afterwards.
 */
export const ChildExit = S.Union([
  S.TaggedStruct('Code', { code: S.Int }),
  S.TaggedStruct('Signal', { signal: S.String }),
])
export type ChildExit = typeof ChildExit.Type

/**
 * The child process hosting a worker ended when it was not supposed to.
 *
 * `exitClass` is a class member, not a schema field. As a field it would have
 * to be supplied at every construction site — the same constant written N
 * times, free to disagree with the tag that determines it — and it would ride
 * the wire, where a decoder would accept an encoded error whose class
 * contradicts its own tag.
 */
export class ChildProcessCrashedError extends S.TaggedError<ChildProcessCrashedError>()(
  'ChildProcessCrashedError',
  {
    pid: ProcessId,
    exit: ChildExit,
    cause: S.optional(S.Unknown),
  },
) {
  readonly exitClass = ExitClass.InternalError
}

/**
 * The child process ran out of memory.
 *
 * Kept distinct from a generic crash because `test-runner/retry-rejected` and
 * `checker/checker-retry` both branch on it: an out-of-memory worker is
 * restarted and its work retried, and the run continues. Collapsing it into the
 * crash tag would silently disable both retries, so a run that used to recover
 * would fail.
 */
export class OutOfMemoryError extends S.TaggedError<OutOfMemoryError>()(
  'OutOfMemoryError',
  {
    pid: ProcessId,
    exitCode: S.Int,
  },
) {
  readonly exitClass = ExitClass.RuntimeError
}
