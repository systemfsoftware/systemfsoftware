/**
 * One ordered native-process stream chunk retained by the runner.
 *
 * Consumers append this record to `events.jsonl` and append its text to the
 * stage log named by `stage`, preserving native delivery order for later
 * audit.
 */
export interface ITtscEvidenceBenchmarkOutput {
  /** Zero-based arrival order within one native process. */
  sequence: number;

  /** Milliseconds since that native process started. */
  elapsedMs: number;

  /** Process stream that produced or received the chunk. */
  stream: "stdin" | "stdout" | "stderr";

  /**
   * Retained Goal name that owned the thread when the chunk arrived.
   *
   * The stage cursor never moves backwards, so appending each chunk to
   * `<stage>.log` and reading those files back in objective order reproduces
   * the original byte stream exactly, including a JSON line the runtime split
   * across a stage boundary.
   */
  stage: string;

  /** Exact bytes decoded as text without normalization. */
  text: string;
}
