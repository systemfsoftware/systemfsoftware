/**
 * The classed process exit codes (R6). The final code is decided once, at
 * teardown, by the precedence `signal > 4 > 3 > 2 > 1 > 0`; verdict gates
 * record a pending class instead of writing `process.exitCode` directly.
 */
export enum ExitClass {
  VerdictFail = 1,
  ConfigError = 2,
  RuntimeError = 3,
  InternalError = 4,
}

const pendingExitClasses: Set<ExitClass> = new Set()

export function setPendingExitClass(exitClass: ExitClass): void {
  pendingExitClasses.add(exitClass)
}

export function getPendingExitClasses(): ReadonlySet<ExitClass> {
  return pendingExitClasses
}

/**
 * Resolves the final process exit code (R6): a terminating signal wins over
 * every pending class and maps to the POSIX `128 + n` convention; otherwise
 * the highest pending class wins; no signal and no pending class is 0.
 *
 * Pure function — unit-tested over the whole precedence matrix.
 *
 * @param pending the classes recorded by the verdict gates
 * @param signal the OS signal number that terminated the run, if any
 * (SIGINT = 2, SIGTERM = 15, …)
 */
export function resolveExitCode(
  pending: ReadonlySet<ExitClass>,
  signal: number | null,
): number {
  if (signal !== null) {
    return 128 + signal
  }
  let code = 0
  for (const exitClass of pending) {
    if (exitClass > code) {
      code = exitClass
    }
  }
  return code
}
