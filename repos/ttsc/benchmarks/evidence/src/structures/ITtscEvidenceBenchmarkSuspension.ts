/** Verified interval in which a benchmark process could not perform work. */
export interface ITtscEvidenceBenchmarkSuspension {
  /** Native process whose elapsed counter includes the interval. */
  processIndex: number;

  /** Objective active throughout the interval, or null for process overhead. */
  instructionIndex: number | null;

  /** Inclusive wall-clock start in ISO 8601 format. */
  startedAt: string;

  /** Exclusive wall-clock end in ISO 8601 format. */
  endedAt: string;

  /** Independent evidence used to verify the suspension. */
  source: "verified-power-log";
}

/** Immutable audit sidecar for one retained benchmark run. */
export interface ITtscEvidenceBenchmarkSuspensionLog {
  schemaVersion: 1;
  suspensions: ITtscEvidenceBenchmarkSuspension[];
}
