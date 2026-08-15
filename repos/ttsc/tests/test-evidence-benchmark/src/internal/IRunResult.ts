/**
 * Everything one workspace command said, captured for assertion.
 *
 * The exit status and the text are kept apart because they answer different
 * questions: whether the command rejected the workspace, and which diagnostic
 * it rejected it with. A case that asserts only the text can pass while the
 * command succeeded, and a case that asserts only the status cannot tell a
 * claim that fired from a claim that never loaded.
 */
export interface IRunResult {
  /** The script this result came from, for a failure message that locates it. */
  readonly script: string;

  /** Absolute directory the command ran in. */
  readonly cwd: string;

  /** Process exit status, or `null` when the run was killed by a signal. */
  readonly status: number | null;

  /** Everything the run wrote to standard output. */
  readonly stdout: string;

  /** Everything the run wrote to standard error. */
  readonly stderr: string;

  /** Stdout and stderr joined, for substring assertions. */
  readonly output: string;

  /** Wall-clock duration of the run in milliseconds. */
  readonly elapsedMs: number;
}
