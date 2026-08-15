package evidence

import "testing"

/**
 * Verifies the merge did not become "never report a namespace".
 *
 * The negative twin of the two cases above. Folding merged declarations into
 * one identity must not exempt a namespace that is genuinely undocumented, or
 * the fix would trade a false positive for a silent miss.
 *
 *  1. Leave a standalone namespace undocumented.
 *  2. Run the rule.
 *  3. Assert it is reported.
 */
func TestDocumentedStillReportsAnUndocumentedNamespace(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/Orders.ts", `
export namespace Orders {
  /** Current version. */
  export const version = "1";
}
`, ""), "Missing JSDoc on exported type 'Orders'")
}

/**
 * Verifies a documented inner declaration does not discharge an outer one of
 * the same name.
 *
 * Identity is qualified, so `A.f` and `f` are different obligations. A grouping
 * keyed on the bare name plus source adjacency would let the inner block excuse
 * the outer declaration — a silent miss, and the failure mode this rule exists
 * to remove.
 *
 *  1. Document a namespace member named `f` and leave a top-level `f` bare.
 *  2. Run the rule.
 *  3. Assert the top-level declaration is still reported.
 */
func TestDocumentedKeepsQualifiedIdentitiesSeparate(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/f.ts", `
/** Namespace A. */
export namespace A {
  /** Inner documented. */
  export function f(): void {}
}
export function f(): void {}
`, ""), "Missing JSDoc on exported function 'f'")
}

/**
 * Verifies a property is named with its owner.
 *
 * The graph addresses those units as `IAlpha.id` and `IBeta.id`, so a finding
 * naming a bare `id` twice leaves a reader unable to tell the two apart in a
 * build log — and unable to write the citation the diagnostic is asking for.
 *
 *  1. Leave a same-named property undocumented on two interfaces.
 *  2. Run the rule.
 *  3. Assert each finding carries its owner.
 */
func TestDocumentedNamesPropertiesWithTheirOwner(t *testing.T) {
  messages := runDocumentedRule(t, "src/contracts.ts", `
/** First contract. */
export interface IAlpha {
  id: string;
}
/** Second contract. */
export interface IBeta {
  id: string;
}
`, "")
  assertReportedAmong(t, messages, "exported property 'IAlpha.id'")
  assertReportedAmong(t, messages, "exported property 'IBeta.id'")
}

/**
 * Verifies a namespace member is named with its namespace.
 *
 * Same reasoning one scope deeper: `Orders.version` is the target a citation
 * would have to name.
 *
 *  1. Leave a namespace member undocumented.
 *  2. Run the rule.
 *  3. Assert the qualified name is reported.
 */
func TestDocumentedNamesNamespaceMembersWithTheirScope(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/Orders.ts", `
/** Order contracts. */
export namespace Orders {
  export const version = "1";
}
`, ""), "exported property 'Orders.version'")
}
