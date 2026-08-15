package evidence

import "testing"

/**
 * Verifies completion keeps positive targets while removing strict exclusion targets.
 *
 * The hint API has no cursor or claim context, so it can only publish the union that is legal somewhere. A target selected solely by a forbid-exclusion reference must disappear only from the exclusion trigger and remain available to positive evidence.
 *
 *  1. Satisfy a strict Markdown reference with positive evidence.
 *  2. Read the passing graph's two completion triggers.
 *  3. Assert the target remains positive-only.
 */
func TestHintsOmitTargetsBelongingOnlyToForbiddenExclusionReferences(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "docs/spec.md": "## Contract {#contract}\n",
    "src/test.ts": `/** @evidence docs/spec.md#contract Implements the contract. */
export function testContract(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "symbol":"function",
    "reference":{
      "type":"markdown",
      "files":["docs/spec.md"],
      "symbol":"h2",
      "noEvidenceExclude":true
    }
  }]}`)
  assertSilent(t, messages)
  positive := targetInserts(targetHintsAt(hints, "@evidence "))
  exclusion := targetInserts(targetHintsAt(hints, "@evidenceExclude "))
  if !contains(positive, "docs/spec.md#contract") {
    t.Fatalf("strict target disappeared from positive hints: %v", positive)
  }
  if contains(exclusion, "docs/spec.md#contract") {
    t.Fatalf("strict-only target leaked into exclusion hints: %v", exclusion)
  }
}

/**
 * Verifies one allowed reference keeps a target in the global exclusion corpus.
 *
 * Identical references are independent obligations, and the cursorless hint API cannot know which one the author is editing. A target legal under any enabled reference must therefore remain offered even when a strict twin selects the same graph identity.
 *
 *  1. Select one section through strict and ordinary references.
 *  2. Satisfy both with one positive citation.
 *  3. Assert the shared target remains an exclusion hint.
 */
func TestHintsKeepTargetsAllowedByAnyReference(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "docs/spec.md": "## Contract {#contract}\n",
    "src/test.ts": `/** @evidence docs/spec.md#contract Implements the contract. */
export function testContract(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "symbol":"function",
    "reference":[
      {
        "type":"markdown",
        "files":["docs/spec.md"],
        "symbol":"h2",
        "noEvidenceExclude":true
      },
      {
        "type":"markdown",
        "files":["docs/spec.md"],
        "symbol":"h2"
      }
    ]
  }]}`)
  assertSilent(t, messages)
  exclusion := targetInserts(targetHintsAt(hints, "@evidenceExclude "))
  if !contains(exclusion, "docs/spec.md#contract") {
    t.Fatalf("allowed twin did not preserve the exclusion hint: %v", exclusion)
  }
}

/**
 * Verifies a strict TypeScript reference filters its exclusion route only.
 *
 * TypeScript symbols are completed by the language service after the plugin inserts `{@link `. That route is still a target hint, so offering it at `@evidenceExclude` when every TypeScript reference forbids exclusions would advertise an impossible declaration.
 *
 *  1. Satisfy one strict TypeScript reference through a real imported symbol.
 *  2. Read positive and exclusion completion triggers.
 *  3. Assert only positive evidence receives the inline-link route.
 */
func TestHintsOmitTheTypeScriptRouteForStrictExclusions(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "src/contract.ts": "export interface IContract {}\n",
    "src/test.ts": `import type { IContract } from "./contract";

/** @evidence {@link IContract} Implements the contract. */
export function testContract(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/test.ts"],
    "symbol":"function",
    "reference":{
      "type":"typescript",
      "files":["src/contract.ts"],
      "symbol":"type",
      "noEvidenceExclude":true
    }
  }]}`)
  assertSilent(t, messages)
  positive := targetInserts(targetHintsAt(hints, "@evidence "))
  exclusion := targetInserts(targetHintsAt(hints, "@evidenceExclude "))
  if !contains(positive, "{@link ") {
    t.Fatalf("positive TypeScript route was removed: %v", positive)
  }
  if contains(exclusion, "{@link ") {
    t.Fatalf("strict TypeScript route leaked into exclusion hints: %v", exclusion)
  }
}
