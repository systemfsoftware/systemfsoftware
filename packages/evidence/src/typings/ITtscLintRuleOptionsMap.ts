import type { ITtscEvidenceDocumentedConfig } from "../structures/ITtscEvidenceDocumentedConfig";
import type { ITtscEvidenceGraphConfig } from "../structures/ITtscEvidenceGraphConfig";

declare module "@ttsc/lint" {
  interface ITtscLintRuleOptionsMap {
    /**
     * Declares this project's evidence graph.
     *
     * The claims define the citing populations and the independently complete
     * evidence references each one must acknowledge.
     */
    "evidence/graph": ITtscEvidenceGraphConfig;

    /**
     * Requires a JSDoc block on every selected export.
     *
     * A JSDoc block is the only place an `@evidence` tag is read from, so an
     * export without one cannot participate in the graph at all.
     */
    "evidence/documented": ITtscEvidenceDocumentedConfig;
  }
}
