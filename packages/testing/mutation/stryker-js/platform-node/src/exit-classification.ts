/**
 * The classed process exit codes (R6). The final code is decided once, at
 * teardown, by the precedence `signal > 4 > 3 > 2 > 1 > 0` implemented by
 * `highestExitClass` (`4 > 3 > 2 > 1`) and `resolveExitCode` (`signal > 4 > 3 > 2 > 1 > 0`);
 * verdict gates record a pending class, and the CLI collects `exitClass` values
 * from every reason in the failure's `Cause` and from each error's nested
 * `cause` field, taking the highest — so the precedence is not a comment but
 * the function callers actually use.
 */
export { ExitClass } from './exit-classification.schema.js'
import type { ExitClass } from './exit-classification.schema.js'

export const EXIT_CODE: Record<ExitClass, number> = {
  VerdictFail: 1,
  ConfigError: 2,
  RuntimeError: 3,
  InternalError: 4,
}

/**
 * Whether a finished run's score fails its own breaking threshold.
 *
 * A pure decision over two numbers, which is what it always was: the run knows
 * the score, the configuration knows the threshold, and the comparison needs
 * nothing else. It replaces a module-scope `Set` that one package wrote to and
 * another read from — a channel invisible in both signatures, shared by every
 * run in the process, and correct only if the reader happened to run after the
 * writer. Nothing expressed that ordering, so two runs in one process (a test
 * suite, or the programmatic API called twice) saw each other's verdicts.
 *
 * `null` for "nothing to report": no breaking threshold configured, or a run
 * with no mutants and therefore no score. Neither is a failure.
 */
export function verdictExitClass(
  score: number | null,
  breakingThreshold: number | null,
): ExitClass | null {
  if (breakingThreshold === null || score === null) {
    return null
  }
  if (score < breakingThreshold) {
    return 'VerdictFail'
  }
  return null
}

/**
 * Resolves the final process exit code (R6): a terminating signal wins over
 * every pending class and maps to the POSIX `128 + n` convention; otherwise
 * the highest pending class wins; no signal and no pending class is 0.
 *
 * Pure function — unit-tested over the whole precedence matrix.
 *
 * @param pending the classes the run reported, usually none or one
 * @param signal the OS signal number that terminated the run, if any
 * (SIGINT = 2, SIGTERM = 15, …)
 */
export function resolveExitCode(
  pending: Iterable<ExitClass>,
  signal: number | null,
): number {
  if (signal !== null) {
    return 128 + signal
  }
  const highest = highestExitClass(pending)
  if (highest === null) {
    return 0
  }
  return EXIT_CODE[highest]
}

/**
 * The most severe class among those reported, or `null` when none was.
 *
 * Separate from `resolveExitCode` because callers need two different things
 * from the same precedence rule. The process needs a NUMBER, where "nothing
 * reported" is `0`. A run's outcome needs the CLASS, where "nothing reported"
 * is absence — and `0` is not an `ExitClass`, so a caller wanting the class
 * from `resolveExitCode` had to map the number back onto the class set and invent a
 * meaning for `0`. Deriving both from this one function keeps a single
 * definition of "most severe" instead of two that can disagree.
 */
export function highestExitClass(pending: Iterable<ExitClass>): ExitClass | null {
  let highest: ExitClass | null = null
  for (const exitClass of pending) {
    if (highest === null || EXIT_CODE[exitClass] > EXIT_CODE[highest]) {
      highest = exitClass
    }
  }
  return highest
}
