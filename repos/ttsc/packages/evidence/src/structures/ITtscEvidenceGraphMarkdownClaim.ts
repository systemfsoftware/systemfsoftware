import type { TtscEvidenceGraphMarkdownSymbol } from "../typings/TtscEvidenceGraphMarkdownSymbol";
import type { ITtscEvidenceGraphClaimBase } from "./ITtscEvidenceGraphClaimBase";

/**
 * A population of Markdown documents claiming its referenced evidence.
 *
 * Markdown uses HTML comments as invisible but reviewable declaration hosts.
 * Both `@evidence <target> <reason>` and `@evidenceExclude <target> <reason>`
 * require a target and a non-empty explanation.
 *
 * An exclusion still has to appear in a selected claim file and on a selected
 * host kind. Its particular host is not part of the acknowledgement identity,
 * so moving it between eligible sections cannot change the target scope this
 * claim excludes. The target scope, not the declaration's host position,
 * determines which selected descendants are acknowledged.
 *
 * @example
 *   <!-- @evidence docs/orders.md#create-order This section adopts the creation contract. -->
 */
export interface ITtscEvidenceGraphMarkdownClaim extends ITtscEvidenceGraphClaimBase<"markdown"> {
  /**
   * Glob patterns for the Markdown files that must cite the referenced
   * evidence. Every matching regular file is parsed as Markdown regardless of
   * extension, so exclude non-Markdown assets rather than relying on a suffix.
   */
  files: string[];

  /**
   * Markdown node kind or kinds eligible to host this claim's declarations.
   *
   * Omit this property to select documents and H1 through H4 sections. A single
   * value selects one kind; a non-empty array selects the union of its kinds.
   *
   * A `"file"` declaration appears before the document's first ATX heading. A
   * heading declaration belongs to the nearest preceding ATX heading, whose
   * exact level must be selected. This makes an H3 declaration distinct from
   * its enclosing H2 section.
   *
   * @default ["file", "h1", "h2", "h3", "h4"]
   */
  symbol?: TtscEvidenceGraphMarkdownSymbol | TtscEvidenceGraphMarkdownSymbol[];
}
