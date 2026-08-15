import type { EvidenceBenchmarkReviewScope } from "../typings/EvidenceBenchmarkReviewScope";

/** One immutable objective slot in a run's retained adaptive plan. */
export interface ITtscEvidenceBenchmarkInstructionPlanEntry {
  /** Stable report name. Supplementation names end in `-remind-<attempt>`. */
  name: string;

  /** Instruction path relative to the frozen instruction root. */
  relativePath: string;

  /**
   * Whether this slot belongs to the adaptive base, a supplement, or a frozen
   * legacy run.
   */
  kind: "base" | "review-supplement" | "legacy-base";

  /** Review scope supplemented by this dynamic slot. */
  reviewScope?: EvidenceBenchmarkReviewScope;

  /** One-based supplementation number, bounded to one through four. */
  reviewAttempt?: number;

  /** Exact concrete correction text appended to the minimal reminder base. */
  reviewFeedback?: string;
}
