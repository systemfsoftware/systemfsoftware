/**
 * Resolved paths returned after atomic workspace preparation.
 *
 * The stage directory is renamed to `root` only after installation and the
 * baseline commit succeed, so callers never observe a partial workspace.
 */
export interface ITtscEvidenceBenchmarkWorkspaceResult {
  /** Final run directory containing records and workspace. */
  root: string;

  /** Prepared nested project used by the measured agent. */
  workspace: string;
}
