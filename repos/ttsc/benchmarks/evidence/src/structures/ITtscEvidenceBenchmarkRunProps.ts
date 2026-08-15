import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort";
import type { ITtscEvidenceBenchmarkCheckpointStorage } from "./ITtscEvidenceBenchmarkCheckpointStorage";
import type { ITtscEvidenceBenchmarkGoalRecord } from "./ITtscEvidenceBenchmarkGoalRecord";
import type { ITtscEvidenceBenchmarkOutput } from "./ITtscEvidenceBenchmarkOutput";
import type { ITtscEvidenceBenchmarkRunState } from "./ITtscEvidenceBenchmarkRunState";

/**
 * Inputs and append-only observers for a Codex benchmark execution.
 *
 * The runner owns native protocol progression, while the caller owns durable
 * persistence of stream chunks and immutable state snapshots.
 */
export interface ITtscEvidenceBenchmarkRunProps {
  /** Fresh or retained state to execute. */
  state: ITtscEvidenceBenchmarkRunState;

  /** Prepared measured workspace. */
  cwd: string;

  /** Retained run root needed to verify external supervision evidence. */
  runRoot?: string;

  /** Frozen directory containing prescribed instructions. */
  instructionsRoot: string;

  /** Explicit native model identifier. */
  model: string;

  /** Explicit native reasoning effort. */
  effort: EvidenceBenchmarkEffort;

  /** Repository revision of this runner invocation. */
  runnerRevision?: string;

  /** Sanitized child-process environment. */
  environment?: NodeJS.ProcessEnv;

  /** Optional executable override used by deterministic fixtures. */
  command?: string;

  /** Arguments placed before the native Codex arguments. */
  commandPrefixArguments?: readonly string[];

  /** Exact source boundary used to create a checkpoint-derived thread. */
  fork?: {
    sourceSessionId: string;
    terminalTurnId: string;
  };

  /** Ends cleanly after retaining the named recovery boundary. */
  stopAfterGoal?: "backend-start";

  /** Registers runner-owned backend review ledger tools on a fresh thread. */
  reviewLedger?: "backend";

  /** Grace period for app-server to exit after its standard input closes. */
  shutdownGraceMs?: number;

  /**
   * Hard bound on one runner-owned review inspection.
   *
   * An inspection that never returns would stall the cell behind a process
   * nobody is watching, so it is stopped and recorded as a failed inspection,
   * which leaves the run at the operator boundary instead of nowhere.
   */
  inspectionTimeoutMs?: number;

  /** Append-only observer for native stream chunks. */
  onOutput: (
    processIndex: number,
    output: ITtscEvidenceBenchmarkOutput,
  ) => void | Promise<void>;

  /** Durable observer for each retained state transition. */
  onState?: (state: ITtscEvidenceBenchmarkRunState) => void | Promise<void>;

  /** Persists a workspace checkpoint before the next Goal is dispatched. */
  onCheckpoint?: (request: {
    state: ITtscEvidenceBenchmarkRunState;
    goal: ITtscEvidenceBenchmarkGoalRecord;
    processElapsedMs: number;
  }) =>
    | ITtscEvidenceBenchmarkCheckpointStorage
    | Promise<ITtscEvidenceBenchmarkCheckpointStorage>;
}
