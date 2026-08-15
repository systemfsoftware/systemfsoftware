/**
 * Selects the native Codex reasoning effort for one measured cell.
 *
 * The value is retained with the run identity because changing it invalidates
 * comparison and requires a new authorized run.
 */
export type EvidenceBenchmarkEffort =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";
