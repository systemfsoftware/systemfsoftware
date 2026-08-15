import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm";
import type { EvidenceBenchmarkReviewScope } from "../typings/EvidenceBenchmarkReviewScope";
import type { ITtscEvidenceBenchmarkCheckpoint } from "./ITtscEvidenceBenchmarkCheckpoint";
import type { ITtscEvidenceBenchmarkGoalRecord } from "./ITtscEvidenceBenchmarkGoalRecord";
import type { ITtscEvidenceBenchmarkInspection } from "./ITtscEvidenceBenchmarkInspection";
import type { ITtscEvidenceBenchmarkInstructionPlanEntry } from "./ITtscEvidenceBenchmarkInstructionPlanEntry";
import type { ITtscEvidenceBenchmarkInterruption } from "./ITtscEvidenceBenchmarkInterruption";
import type { ITtscEvidenceBenchmarkProcessRecord } from "./ITtscEvidenceBenchmarkProcessRecord";
import type { ITtscEvidenceBenchmarkReviewLedger } from "./ITtscEvidenceBenchmarkReviewLedger";
import type { ITtscEvidenceBenchmarkSupervisionVerdict } from "./ITtscEvidenceBenchmarkSupervisionVerdict";
import type { ITtscEvidenceBenchmarkTokenUsage } from "./ITtscEvidenceBenchmarkTokenUsage";

/**
 * Complete resumable Codex state for one benchmark cell.
 *
 * `state.json` persists this structure after each meaningful transition so a
 * later process can prove the exact thread and Goal boundary before resuming.
 */
export interface ITtscEvidenceBenchmarkRunState {
  /** Selected experiment arm. */
  arm: EvidenceBenchmarkArm;

  /** Native Codex thread identifier after creation. */
  sessionId?: string;

  /** Exact native CLI version retained at launch. */
  cliVersion?: string;

  /** Next objective position to execute. */
  nextInstructionIndex: number;

  /** Current runner lifecycle state. */
  status:
    | "ready"
    | "running"
    | "checkpointed"
    | "awaiting-review-verdict"
    | "quality-failed"
    | "interrupted"
    | "completed";

  /** Latest cumulative thread token counters. */
  threadTokenUsage: ITtscEvidenceBenchmarkTokenUsage;

  /** First Goal owned by the current native thread after a detached checkpoint. */
  nativeThreadStartInstructionIndex?: number;

  /** Ordered retained Goal records. */
  goals: ITtscEvidenceBenchmarkGoalRecord[];

  /** Frozen base objectives plus append-only-positioned review supplements. */
  instructionPlan?: ITtscEvidenceBenchmarkInstructionPlanEntry[];

  /** Durable recovery points created at prescribed Goal boundaries. */
  checkpoints?: ITtscEvidenceBenchmarkCheckpoint[];

  /** External Plain review decisions retained outside agent self-report. */
  supervisionPauses?: {
    scope: EvidenceBenchmarkReviewScope;
    attempt: number;
    afterGoal: string;
    goalIndex: number;
    pausedAt: string;
    /**
     * Every runner-owned inspection attempted at this boundary, in order.
     *
     * A resumed run retries a failed inspection, so the list holds each
     * attempt's own cost and failure rather than only the last one.
     */
    inspections?: ITtscEvidenceBenchmarkInspection[];
    verdict?: ITtscEvidenceBenchmarkSupervisionVerdict;
    resumedAt?: string;
  }[];

  /**
   * Operator warnings attached to a stopped cell's objective.
   *
   * A warning names a frozen boundary the cell crossed, or supplies an
   * authorization it correctly refused to fabricate. It lives here rather than
   * on the instruction plan because the plan's base sequence must stay
   * byte-identical to the frozen one, which is what proves nobody rewrote the
   * objectives themselves.
   */
  operatorWarnings?: {
    instructionIndex: number;
    instructionName: string;
    feedback: string;
    warnedAt: string;
    verdictRelativePath: string;
  }[];

  /** Process time inherited by a checkpoint-derived run. */
  inheritedProcessElapsedMs?: number;

  /** Every native process used by launch or resume. */
  processes: ITtscEvidenceBenchmarkProcessRecord[];

  /** Runner-owned manifests and reads for externally enforced review Goals. */
  reviewLedgers?: ITtscEvidenceBenchmarkReviewLedger[];

  /** Failure detail when exact continuation stopped. */
  interruption?: ITtscEvidenceBenchmarkInterruption;
}
