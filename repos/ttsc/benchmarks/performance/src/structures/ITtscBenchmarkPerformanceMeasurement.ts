import type { ITtscBenchmarkPerformanceCell } from "./ITtscBenchmarkPerformanceCell.ts";

/** Captured samples and failure state for one performance cell. */
export interface ITtscBenchmarkPerformanceMeasurement {
  /** Stable cell identifier. */
  id: string;

  /** Fixture branch measured by the cell. */
  branch: ITtscBenchmarkPerformanceCell.Branch;

  /** Resolved compiler, linter, or formatter label. */
  tool: string;

  /** Operation performed by the cell. */
  op: ITtscBenchmarkPerformanceCell.Operation;

  /** Threading mode applied by the cell. */
  threading: ITtscBenchmarkPerformanceCell.Threading;

  /** Successful wall-time samples in milliseconds. */
  samples: number[];

  /** Number of race-classified attempts retried before completion. */
  raceRetries?: number;

  /** Native lint sidecar samples in milliseconds when emitted. */
  lintSamples?: number[];

  /** Native lint plugin-only samples in milliseconds when emitted. */
  lintPluginSamples?: number[];

  /** Transform-host samples in milliseconds when emitted. */
  transformHostSamples?: number[];

  /** Terminal failure classification when the cell did not complete. */
  failure?: "race" | "error";

  /** Terminal child exit status, or null for a spawn failure. */
  exitStatus?: number | null;
}
