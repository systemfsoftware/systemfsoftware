import type { ITtscEvidenceGraphClaim } from "./ITtscEvidenceGraphClaim";

/**
 * The root declaration of a project's evidence graph.
 *
 * An evidence graph makes grounds for code and documentation explicit: one side
 * claims to implement, verify, or document something, and the other side is the
 * evidence it must cite with a reason. The configuration defines those
 * boundaries without hardcoding a repository's folder layout or its notion of
 * proof.
 */
export interface ITtscEvidenceGraphConfig {
  /**
   * Claim populations whose files must cite their referenced evidence. Each
   * claim owns its reference obligations; coverage is never pooled across
   * claims. Provide at least one claim; an empty array is invalid because it
   * would enable the rule without establishing any evidence obligation.
   */
  claims: ITtscEvidenceGraphClaim[];
}
