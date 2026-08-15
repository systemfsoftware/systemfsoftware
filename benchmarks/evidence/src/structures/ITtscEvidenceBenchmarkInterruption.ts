/**
 * Serializable reason why a measured cell could not continue exactly.
 *
 * The record crosses the process and JSON boundary, retaining useful native
 * error context without requiring the thrown value itself to be serializable.
 */
export interface ITtscEvidenceBenchmarkInterruption {
  /** Stable error class or interruption category. */
  name: string;

  /** Human-readable native or runner failure. */
  message: string;

  /** Stack trace when the thrown value supplied one. */
  stack?: string;

  /** JSON-safe original failure detail. */
  detail?: unknown;
}
