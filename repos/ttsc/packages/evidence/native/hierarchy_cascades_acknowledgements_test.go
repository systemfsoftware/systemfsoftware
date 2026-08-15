package evidence

import (
  "strings"
  "testing"
)

/**
 * Verifies Markdown file scopes: one file acknowledgement covers every
 * selected heading descendant even when the file kind is not selected.
 *
 * A reference selector defines the obligation denominator, not the only
 * addressable scopes. Requiring `"file"` in the selector would make aggregate
 * citation unavailable to the common H2/H3-only population.
 *
 *  1. Select only H2 and H3 units from one document.
 *  2. Cite the unselected file ancestor once.
 *  3. Assert every selected heading is acknowledged.
 */
func TestMarkdownFileAcknowledgementCoversSelectedDescendants(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `# Product
## Create
### Validate
## Cancel
### Refund
`,
    "src/ref.ts": `
/** @evidence docs/spec.md The complete implementation follows this specification. */
export interface Ref {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":["h2","h3"]}
  }]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies unselected intermediate scopes remain addressable: an H2 can cover
 * selected H3 descendants without joining the obligation denominator.
 *
 * Selector filtering must happen after structural ancestry is recorded.
 * Otherwise omitting H2 would sever the document outline and make its aggregate
 * target unresolved.
 *
 *  1. Select only H3 units below two H2 sections.
 *  2. Cite each unselected H2 ancestor.
 *  3. Assert both H3 obligations are acknowledged.
 */
func TestMarkdownUnselectedHeadingCoversSelectedDescendants(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `## Create
### Validate
## Cancel
### Refund
`,
    "src/ref.ts": `
/**
 * @evidence docs/spec.md#create Creation includes its validation contract.
 * @evidence docs/spec.md#cancel Cancellation includes its refund contract.
 */
export interface Ref {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h3"}
  }]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies Markdown section scopes: an H2 exclusion covers only its own
 * selected subtree and leaves the next H2 subtree owed.
 *
 * Heading containment ends at the next heading of equal or higher rank.
 * Treating all later headings as descendants would let one exclusion erase
 * unrelated sibling requirements.
 *
 *  1. Materialize two H2 sections with one H3 child each.
 *  2. Exclude the first H2 scope.
 *  3. Assert only the second H2 and its child remain missing.
 */
func TestMarkdownHeadingExclusionCoversOnlyItsSubtree(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `## Create
### Validate
## Cancel
### Refund
`,
    "src/ref.ts": `
/** @evidenceExclude docs/spec.md#create This adapter intentionally omits creation. */
export interface Ref {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":["h2","h3"]}
  }]}`)
  if got := countProblemsContaining(messages, "Missing acknowledgement"); got != 2 {
    t.Fatalf("H2 exclusion produced %d missing findings:\n%s", got, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "'docs/spec.md#cancel'")
  assertProblemContains(t, messages, "'docs/spec.md#refund'")
  if strings.Contains(strings.Join(messages, "\n"), "'docs/spec.md#validate'") {
    t.Fatalf("excluded H2 left its H3 child missing:\n%s", strings.Join(messages, "\n"))
  }
}

/**
 * Verifies hierarchy direction: acknowledging a child cannot cover its parent
 * or a sibling subtree.
 *
 * Scope inheritance is downward only. A reverse match would let a narrow
 * implementation claim a broader contract it never named.
 *
 *  1. Cite one H3 child in a document containing two H2 subtrees.
 *  2. Leave its H2 parent and the sibling subtree uncited.
 *  3. Assert all three broader or unrelated units remain missing.
 */
func TestMarkdownChildAcknowledgementDoesNotCoverParentOrSibling(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `## Create
### Validate
## Cancel
### Refund
`,
    "src/ref.ts": `
/** @evidence docs/spec.md#validate This implementation performs validation. */
export interface Ref {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":["h2","h3"]}
  }]}`)
  if got := countProblemsContaining(messages, "Missing acknowledgement"); got != 3 {
    t.Fatalf("H3 citation produced %d missing findings:\n%s", got, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "'docs/spec.md#create'")
  assertProblemContains(t, messages, "'docs/spec.md#cancel'")
  assertProblemContains(t, messages, "'docs/spec.md#refund'")
}

/**
 * Verifies TypeScript type scopes: one type acknowledgement covers selected
 * property descendants even when only properties form the obligation.
 *
 * The type node is an aggregate address for its public contract. Keeping it
 * unresolvable under a property-only selector would force one tag per field and
 * defeat the hierarchy the selector exposes.
 *
 *  1. Select only two properties of one exported interface.
 *  2. Cite the unselected type ancestor once.
 *  3. Assert both properties are acknowledged.
 */
func TestTypeScriptTypeAcknowledgementCoversSelectedProperties(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "src/contracts.ts": `
export interface Shape {
  width: number;
  height: number;
}
`,
    "src/ledger.ts": `import type { Shape } from "./contracts";

/** @evidence {@link Shape} The complete shape contract is documented. */
export interface ILedger {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ledger.ts"],
    "symbol":"type",
    "reference":{"type":"typescript","files":["src/contracts.ts"],"symbol":"property"}
  }]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies TypeScript namespace scopes: one namespace exclusion covers nested
 * public callables and data but not a top-level sibling.
 *
 * Namespace containment is structural. Prefix matching would confuse literal
 * dots and similarly named exports, while treating the entire file as one
 * scope would erase unrelated public contracts.
 *
 *  1. Put function and property units under one namespace plus one root value.
 *  2. Exclude the namespace by link while selecting only child kinds.
 *  3. Assert only the root sibling remains missing.
 */
func TestTypeScriptNamespaceExclusionCoversOnlyNestedUnits(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "src/contracts.ts": `
export namespace Orders {
  export const count = 1;
  export function open(): void {}
  export interface Request {
    id: string;
  }
  export namespace Retry {
    export let limit = 3;
  }
}
export const version = 1;
`,
    "src/ledger.ts": `import type { Orders } from "./contracts";

/** @evidenceExclude {@link Orders} This contract intentionally omits the Orders API. */
export interface ILedger {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ledger.ts"],
    "symbol":"type",
    "reference":{"type":"typescript","files":["src/contracts.ts"],"symbol":["function","property"]}
  }]}`)
  if got := countProblemsContaining(messages, "Missing acknowledgement"); got != 1 {
    t.Fatalf("namespace exclusion produced %d missing findings:\n%s", got, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "'version'")
}

/**
 * Verifies ancestor-only resolution avoids unrelated same-target ambiguity.
 *
 * TypeScript permits type and value declarations with the same public name.
 * A property-only reference needs the owning type as a scope, but an unrelated
 * callable of the same spelling is neither selected nor an ancestor.
 *
 *  1. Materialize an interface and function named `Shared`.
 *  2. Select only the interface property and cite `Shared`.
 *  3. Assert the ancestor resolves without the function becoming a candidate.
 */
func TestTypeScriptAncestorResolutionIgnoresUnrelatedSameTargetKinds(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "src/contracts.ts": `
export interface Shared {
  value: string;
}
export function Shared(): void {}
`,
    "src/ledger.ts": `import type { Shared } from "./contracts";

/** @evidence {@link Shared} The type contract is documented as one scope. */
export interface ILedger {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ledger.ts"],
    "symbol":"type",
    "reference":{"type":"typescript","files":["src/contracts.ts"],"symbol":"property"}
  }]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies conflicting scopes remain an error: a child exclusion cannot hide
 * inside a parent evidence acknowledgement.
 *
 * Evidence and exclusion express opposite intent even though both discharge an
 * obligation. Allowing their overlap as an idempotent set union would erase the
 * contradiction from review.
 *
 *  1. Acknowledge a complete Markdown file.
 *  2. Exclude one H2 subtree in a second declaration.
 *  3. Assert the overlap produces one conflict diagnostic.
 */
func TestEvidenceAndExclusionScopesConflictOnce(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `## Create
### Validate
`,
    "src/ref.ts": `
/**
 * @evidence docs/spec.md The implementation follows the complete specification.
 * @evidenceExclude docs/spec.md#create Creation is supposedly excluded.
 */
export interface Ref {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":["h2","h3"]}
  }]}`)
  if got := countProblemsContaining(messages, "Conflicting acknowledgements"); got != 1 {
    t.Fatalf("overlapping scopes produced %d conflict findings:\n%s", got, strings.Join(messages, "\n"))
  }
}
