import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'

import type { ChildProcessCrashedError, OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'

import type { CheckerCrash, CheckerResourceService } from './checker-resource.js'

/** Render the crash for the log line, naming which kind it was. */
const describe = (error: CheckerCrash): string =>
  Match.value(error).pipe(
    Match.tag(
      'OutOfMemoryError',
      (oom) => `Checker process [${oom.pid}] ran out of memory. Retrying in a new process.`,
    ),
    Match.tag('ChildProcessCrashedError', (crash) =>
      `Checker process [${crash.pid}] crashed (${
        Match.value(crash.exit).pipe(
          Match.tag('Code', ({ code }) =>
            `exit code ${code}`),
          Match.tag('Signal', ({ signal }) => `signal ${signal}`),
          Match.exhaustive,
        )
      }). Retrying in a new process.`),
    Match.exhaustive,
  )
/**
 * Retry a checker call once in a fresh process when the worker crashed.
 *
 * Replaces `CheckerRetryDecorator`, and repairs a defect the tagged-error
 * rewrite exposed. That class nested its checks:
 *
 * ```ts
 * if (error instanceof ChildProcessCrashedError) {
 *   if (error instanceof OutOfMemoryError) { … }
 * ```
 *
 * which only ever worked because `OutOfMemoryError` extended
 * `ChildProcessCrashedError`. They are sibling variants now, so the outer test
 * is false for an out-of-memory crash and the inner branch is unreachable — the
 * checker would have stopped retrying the exact failure this exists for, and
 * nothing would have said so. Branching on the tag makes the two cases
 * independent, and adding a third crash variant is then a compile error here
 * rather than a silent fall-through to `throw`.
 *
 * `retire` comes from whoever owns the worker's lifetime, so the retry does not
 * rebuild a process the pool still believes it owns.
 */
export const withCrashRetry = (
  retire: Effect.Effect<void>,
): (inner: CheckerResourceService) => CheckerResourceService =>
(inner) => {
  const retrying = <A>(
    action: Effect.Effect<A, CheckerCrash>,
  ): Effect.Effect<A, CheckerCrash> =>
    action.pipe(
      Effect.catchTags({
        OutOfMemoryError: (error: OutOfMemoryError) => recover(error, action),
        ChildProcessCrashedError: (error: ChildProcessCrashedError) => recover(error, action),
      }),
    )

  const recover = <A>(
    error: CheckerCrash,
    action: Effect.Effect<A, CheckerCrash>,
  ): Effect.Effect<A, CheckerCrash> =>
    Effect.logWarning(describe(error)).pipe(
      Effect.andThen(retire),
      // One retry, as before: a checker that crashes twice on the same mutants
      // is reporting something about those mutants, not about the process.
      Effect.andThen(action),
    )

  return {
    ...inner,
    check: (checkerName, mutants) => retrying(inner.check(checkerName, mutants)),
    group: (checkerName, mutants) => retrying(inner.group(checkerName, mutants)),
  }
}
