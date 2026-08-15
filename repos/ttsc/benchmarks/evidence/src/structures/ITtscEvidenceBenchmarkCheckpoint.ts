/**
 * Durable backend-start recovery point retained outside the measured workspace.
 *
 * The workspace copy and native turn boundary must travel together. A source
 * snapshot without its thread boundary, or a thread fork without its exact
 * files, is not a benchmark checkpoint.
 */
export interface ITtscEvidenceBenchmarkCheckpoint {
  /** Stable checkpoint name. */
  name: "backend-start";

  /** Completed objective that owns this boundary. */
  instructionIndex: 0;

  /** Objective to dispatch after recovery. */
  nextInstructionIndex: 1;

  /** Native thread from which a recovery thread must fork. */
  sourceSessionId: string;

  /** Last completed turn included in the recovery fork. */
  terminalTurnId: string;

  /** Native CLI version that created the source thread. */
  cliVersion: string;

  /** Creation time of the durable workspace copy. */
  createdAt: string;

  /** Workspace path relative to the source run root. */
  workspaceRelativePath: string;

  /** Content digest of the durable workspace copy. */
  workspaceSha256: string;

  /** Content digest of material workspace files, excluding reinstallable data. */
  workspaceMaterialSha256: string;

  /** Number of material workspace files copied into the checkpoint. */
  workspaceFileCount: number;

  /** Prepared workspace baseline commit retained by the checkpoint. */
  workspaceGitHead: string;

  /** Exact Git status retained after backend-start. */
  workspaceGitStatus: string;

  /** Native process time accumulated through this boundary. */
  inheritedProcessElapsedMs: number;

  /** Cell wall time accumulated through this boundary. */
  inheritedWallElapsedMs: number;
}
