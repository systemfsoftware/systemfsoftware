import type { ITtscEvidenceGraphMarkdownClaim } from "./ITtscEvidenceGraphMarkdownClaim";
import type { ITtscEvidenceGraphPrismaClaim } from "./ITtscEvidenceGraphPrismaClaim";
import type { ITtscEvidenceGraphTypeScriptClaim } from "./ITtscEvidenceGraphTypeScriptClaim";

/**
 * One population of artifacts asserting that it implements, verifies, or
 * documents its referenced evidence.
 *
 * A claim owns the outgoing side of every evidence edge it declares: its files
 * host the `@evidence` citations, and each referenced evidence population must
 * be acknowledged completely. Separate claims remain separate obligations,
 * preventing two teams' partial use of the same evidence from being reported as
 * one complete use.
 */
export type ITtscEvidenceGraphClaim =
  | ITtscEvidenceGraphMarkdownClaim
  | ITtscEvidenceGraphPrismaClaim
  | ITtscEvidenceGraphTypeScriptClaim;
