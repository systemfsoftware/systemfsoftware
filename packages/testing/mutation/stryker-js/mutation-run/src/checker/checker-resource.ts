import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import type * as Effect from 'effect/Effect'

import type { ChildProcessCrashedError, OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'

/** How a pooled checker can fail: its worker crashed, either way round. */
export type CheckerCrash = ChildProcessCrashedError | OutOfMemoryError

/**
 * A checker held by the pool.
 *
 * The pool must be able to interrupt a checker mid-call when the run is
 * cancelled, so the port uses Effect, which can be interrupted, where a Promise
 * cannot. The error channel names both crash variants rather than `unknown`,
 * which lets the retry combinator prove it handles every one of them.
 */
export interface CheckerResourceService {
  readonly check: (
    checkerName: string,
    mutants: readonly Mutant[],
  ) => Effect.Effect<Record<string, CheckResult>, CheckerCrash>

  /**
   * Partition mutants into groups that can be checked together.
   *
   * A checker with no grouping opinion returns one group per mutant — the
   * identity partition — rather than leaving the member off, which is what
   * every call site used to synthesise for itself.
   */
  readonly group: (
    checkerName: string,
    mutants: readonly Mutant[],
  ) => Effect.Effect<readonly (readonly string[])[], CheckerCrash>
}
