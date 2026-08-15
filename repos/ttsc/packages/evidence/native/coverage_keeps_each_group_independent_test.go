package evidence

import (
  "strings"
  "testing"
)

/**
 * Verifies claim independence: complementary partial claims cannot pool their
 * acknowledgements into one covered evidence population.
 *
 * Each claim sees the same two-unit denominator but acknowledges the opposite
 * half. A union-based implementation would report success even though neither
 * population can account for the complete evidence.
 *
 *  1. Materialize two Markdown evidence units behind two claims.
 *  2. Let each claim acknowledge only one unit.
 *  3. Assert each claim reports its own missing twin.
 */
func TestClaimsCannotPoolPartialCoverage(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": `## Create
## Cancel
`,
    "src/a.ts": `
/** @evidence docs/spec.md#create Claim A implements creation. */
export function create(): void {}
`,
    "src/b.ts": `
/** @evidence docs/spec.md#cancel Claim B implements cancellation. */
export function cancel(): void {}
`,
  }, `{"claims":[
    {
      "type":"typescript",
      "files":["src/a.ts"],
      "symbol":"function",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/b.ts"],
      "symbol":"function",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    }
  ]}`)
  if got := countProblemsContaining(messages, "Missing acknowledgement"); got != 2 {
    t.Fatalf("partial claims produced %d missing findings:\n%s", got, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "'docs/spec.md#cancel'")
  assertProblemContains(t, messages, "Claim 1")
  assertProblemContains(t, messages, "'docs/spec.md#create'")
  assertProblemContains(t, messages, "Claim 2")
}

/**
 * Verifies reference independence: one claim's reference array is one
 * obligation per element, so covering one reference cannot discharge another.
 *
 * Both references resolve through the same claim files and the same
 * declarations. Only the per-reference denominator keeps the second evidence
 * population owed, so coverage must be stored under claim and reference
 * indices rather than under the claim alone.
 *
 *  1. Give one claim two single-unit Markdown references.
 *  2. Acknowledge only the first reference's unit.
 *  3. Assert the second reference reports its own missing unit.
 */
func TestReferencesRemainIndependentObligations(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/a.md": "## Alpha\n",
    "docs/b.md": "## Beta\n",
    "src/ref.ts": `
/** @evidence docs/a.md#alpha The claim adopts Alpha. */
export function ref(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/ref.ts"],
    "symbol":"function",
    "reference":[
      {"type":"markdown","files":["docs/a.md"],"symbol":"h2"},
      {"type":"markdown","files":["docs/b.md"],"symbol":"h2"}
    ]
  }]}`)
  if got := countProblemsContaining(messages, "Missing acknowledgement"); got != 1 {
    t.Fatalf("independent references produced %d missing findings:\n%s", got, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "'docs/b.md#beta'")
  assertProblemContains(t, messages, "reference 2")
}

/**
 * Verifies diagnostic-only names: adding a claim name improves messages but
 * does not enter target identity or graph matching.
 *
 * A label accidentally used as an identity would make the same declaration
 * resolve in an unnamed graph and dangle in a named one. The green pair below
 * pins semantic equality, and the failing case pins diagnostic visibility.
 *
 *  1. Resolve the same target with and without a claim name.
 *  2. Assert both complete graphs are green.
 *  3. Remove the declaration and assert only the named diagnostic text changes.
 */
func TestClaimNameChangesDiagnosticsButNotGraphBehavior(t *testing.T) {
  files := map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/ref.ts": `
/** @evidence docs/spec.md#contract This type adopts the contract. */
export interface Ref {}
`,
  }
  baseClaim := `"type":"typescript","files":["src/ref.ts"],"symbol":"type","reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}`
  assertNoProblems(t, runIndexRule(t, files, `{"claims":[{`+baseClaim+`}]}`))
  assertNoProblems(t, runIndexRule(t, files, `{"claims":[{"name":"Friendly label",`+baseClaim+`}]}`))

  missingFiles := map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/ref.ts":   "export interface Ref {}\n",
  }
  messages := runIndexRule(t, missingFiles, `{"claims":[{"name":"Friendly label",`+baseClaim+`}]}`)
  assertProblemContains(t, messages, "Claim 1 ('Friendly label')")
  assertProblemContains(t, messages, "'docs/spec.md#contract'")
}
