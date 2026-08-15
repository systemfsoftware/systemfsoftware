import type { ITtscEvidenceGraphMarkdownReference } from "./ITtscEvidenceGraphMarkdownReference";
import type { ITtscEvidenceGraphPrismaReference } from "./ITtscEvidenceGraphPrismaReference";
import type { ITtscEvidenceGraphSwaggerReference } from "./ITtscEvidenceGraphSwaggerReference";
import type { ITtscEvidenceGraphTypeScriptReference } from "./ITtscEvidenceGraphTypeScriptReference";

/**
 * One population of evidence units that a claim must cite completely.
 *
 * A reference selects what counts as evidence: Markdown documents and heading
 * sections, Swagger or OpenAPI operations, or selected exported TypeScript
 * symbols. Every unit it materializes must be acknowledged by the owning claim,
 * so a reference is the denominator of one coverage obligation, never a pooled
 * global set.
 */
export type ITtscEvidenceGraphReference =
  | ITtscEvidenceGraphMarkdownReference
  | ITtscEvidenceGraphPrismaReference
  | ITtscEvidenceGraphSwaggerReference
  | ITtscEvidenceGraphTypeScriptReference;
