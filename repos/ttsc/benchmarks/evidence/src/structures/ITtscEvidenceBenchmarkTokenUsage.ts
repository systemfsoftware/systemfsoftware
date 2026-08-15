/**
 * Native Codex token counters retained at a terminal Goal boundary.
 *
 * The runner snapshots cumulative thread counters before and after each Goal
 * and stores their nonnegative delta in this exact shape.
 */
export interface ITtscEvidenceBenchmarkTokenUsage {
  /** All native tokens reported for the thread. */
  totalTokens: number;

  /** All prompt tokens, including the cached subset. */
  inputTokens: number;

  /** Prompt tokens served from the provider cache, included in inputTokens. */
  cachedInputTokens: number;

  /** Prompt tokens written into the provider cache. */
  cacheWriteInputTokens: number;

  /** Generated response tokens, including the reported reasoning subset. */
  outputTokens: number;

  /** Reasoning tokens reported separately by Codex, included in outputTokens. */
  reasoningOutputTokens: number;
}
