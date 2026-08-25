import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type { Mutant } from '../core/index.js'
import type { CheckerFailed } from './CheckerFailed.schema.js'
import type { CheckResult } from './CheckResult.js'

/**
 * What a checker does, as values rather than started work.
 *
 * Every operation returns an `Effect`, so the engine can time it out, retry it,
 * or interrupt it — none of which is possible once a `Promise` has been
 * returned, because the work is already running. That single change is what
 * lets the engine drop its hand-rolled timeout race and its retry loop.
 *
 * `R` is `never` on every operation. A checker's own dependencies — a compiler,
 * a spawned process, a filesystem — are supplied by the `Layer` that builds it,
 * never by the caller, so they do not appear in the interface. A port that
 * leaked them would force every consumer to discover and provide them.
 *
 * `init` and `group` are not optional here, unlike the interfaces this replaces:
 * an absent method made every call site branch on `typeof checker.group`. A
 * checker with nothing to initialise returns `Effect.void`, and one with no
 * grouping opinion returns one group per mutant — which is exactly what the old
 * call sites synthesised when the method was missing, now stated once.
 */
export interface CheckerService {
  readonly init: Effect.Effect<void, CheckerFailed>

  /**
   * Check a group of mutants.
   *
   * @returns the check result per mutant id. A mutant absent from the record is
   * a protocol violation, not an implicit pass: the caller cannot distinguish
   * "the checker declined" from "the checker forgot".
   */
  readonly check: (
    mutants: readonly Mutant[],
  ) => Effect.Effect<ReadonlyMap<string, CheckResult>, CheckerFailed>

  /**
   * Partition mutants into the groups this checker wants to check together.
   *
   * Grouping is an optimisation, so the identity partition — one mutant per
   * group — is always a valid answer and is what a checker with no opinion
   * returns.
   */
  readonly group: (
    mutants: readonly Mutant[],
  ) => Effect.Effect<readonly (readonly string[])[], CheckerFailed>
}

export class Checker extends Context.Service<Checker, CheckerService>()(
  '@systemfsoftware/stryker-js-plugin-api/check/Checker',
) {}
