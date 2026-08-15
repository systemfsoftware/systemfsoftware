import type { TtscEvidenceGraphTypeScriptSymbol } from "../typings/TtscEvidenceGraphTypeScriptSymbol";

/**
 * Options of the `evidence/documented` rule.
 *
 * The rule requires a JSDoc block on every selected export, because a JSDoc
 * block is the only place an `@evidence` tag is ever read from. A symbol
 * without one cannot cite anything: the citation has no location to live in,
 * and the graph's obligation silently shifts onto whichever sibling does have a
 * block.
 *
 * Presence is the whole check. The rule never judges what the prose says, how
 * long it is, or whether it is sincere — a rule that tried would only teach
 * authors to write filler that satisfies it.
 */
export interface ITtscEvidenceDocumentedConfig {
  /**
   * Symbol kind or kinds that must carry a JSDoc block.
   *
   * Omit this property to select every kind a claim can use as a declaration
   * host. That default is deliberate: the population which must be able to hold
   * a tag is exactly the population a claim can select as a host, so a narrower
   * default would leave some potential host unable to cite while the rule
   * reported success.
   *
   * A single value selects one kind; a non-empty array selects the union. The
   * exact declaration forms behind each kind are documented by
   * {@link TtscEvidenceGraphTypeScriptSymbol}.
   *
   * @default ["type", "function", "property"]
   */
  symbol?:
    | TtscEvidenceGraphTypeScriptSymbol
    | TtscEvidenceGraphTypeScriptSymbol[];
}
