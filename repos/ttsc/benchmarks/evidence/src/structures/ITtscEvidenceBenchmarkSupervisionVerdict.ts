import type { EvidenceBenchmarkReviewScope } from "../typings/EvidenceBenchmarkReviewScope";
import type { ITtscEvidenceBenchmarkWorkspaceIdentity } from "./ITtscEvidenceBenchmarkWorkspaceIdentity";

/** External decision bound to one completed Goal and workspace state. */
export interface ITtscEvidenceBenchmarkSupervisionVerdict {
  /** Review scope independently inspected outside the measured thread. */
  scope: EvidenceBenchmarkReviewScope;

  /** Zero for Review and one through four for supplementation Goals. */
  attempt: number;

  /** Whether the inspected attempt substantively passed. */
  decision: "pass" | "fail";

  /** Resulting deterministic state-machine transition. */
  action: "final" | "retry" | "quality-failed";

  /** Time at which the external supervisor recorded the decision. */
  decidedAt: string;

  /** Retained Goal index independently inspected by the supervisor. */
  goalIndex: number;

  /** Terminal turn independently inspected by the supervisor. */
  terminalTurnId: string;

  /** Non-empty decision basis retained verbatim outside the measured thread. */
  rationale: string;

  /** Concrete measured-thread correction text required for a failed attempt. */
  feedback?: string;

  /** Immutable submitted verdict location relative to the retained run root. */
  verdictRelativePath: string;

  /** Digest of the exact submitted verdict bytes. */
  verdictSha256: string;

  /** Exact product state inspected by the supervisor. */
  workspace: ITtscEvidenceBenchmarkWorkspaceIdentity;
}
