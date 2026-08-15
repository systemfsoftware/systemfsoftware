package evidence

import (
  "strings"
  "testing"
)

/**
 * Verifies overlapping claim files attribute declarations by host eligibility.
 *
 * A type and each of its properties live in one file, so separate type and
 * property claims necessarily match the same inventory. Copying every
 * declaration into both claims made the type's parent-scope citation fail the
 * property claim even though each obligation had its own valid citation.
 *
 *  1. Select one file with separate type and property claims.
 *  2. Cite an H2 from the type and its selected H3 from the property.
 *  3. Assert both independent obligations pass without a false scope error.
 */
func TestOverlappingClaimsAttributeDeclarationsToEligibleHosts(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": "## Entity\n### Identifier\n",
    "src/entity.ts": `
/** @evidence docs/spec.md#entity The type implements the entity contract. */
export interface Entity {
  /** @evidence docs/spec.md#identifier This field implements the identifier contract. */
  id: string;
}
`,
  }, `{"claims":[
    {
      "name":"entity types",
      "type":"typescript",
      "files":["src/entity.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    },
    {
      "name":"entity properties",
      "type":"typescript",
      "files":["src/entity.ts"],
      "symbol":"property",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h3"}
    }
  ]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies a mixed host can participate in every selector it actually has.
 *
 * TypeScript attaches one JSDoc block to a mixed variable statement whose
 * declarations classify as a function and a property. Choosing one owner would
 * make the other claim report missing even though the physical host supports
 * both selectors.
 *
 *  1. Put a function and property in one exported variable statement.
 *  2. Match the file from separate function and property claims.
 *  3. Assert the shared declaration satisfies both obligations.
 */
func TestOverlappingClaimsKeepMixedHostsEligibleForSeveralClaims(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/mixed.ts": `
/** @evidence docs/spec.md#contract Both exports implement this contract. */
export const execute = (): void => {}, value = 1;
`,
  }, `{"claims":[
    {
      "type":"typescript",
      "files":["src/mixed.ts"],
      "symbol":"function",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/mixed.ts"],
      "symbol":"property",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    }
  ]}`)
  assertNoProblems(t, messages)
}

/**
 * Verifies a genuinely ineligible declaration is reported once across overlaps.
 *
 * Suppressing every ineligible overlap would hide a real misplaced tag, while
 * reporting per claim floods one source mistake into several diagnostics. The
 * declaration is therefore invalid only when no owning claim accepts its host,
 * and the one finding names every obligation it failed to join.
 *
 *  1. Activate type and property claims beside one function declaration.
 *  2. Resolve the function's target inside both references.
 *  3. Assert one scope finding names both claims while coverage remains missing.
 */
func TestOverlappingClaimsReportOneGenuineOutOfScopeDeclaration(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/ref.ts": `
/** @evidence docs/spec.md#contract This function belongs to neither selector. */
export function ref(): void {}
export interface SelectedType {}
export const selectedProperty = true;
`,
  }, `{"claims":[
    {
      "name":"types",
      "type":"typescript",
      "files":["src/ref.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    },
    {
      "name":"properties",
      "type":"typescript",
      "files":["src/ref.ts"],
      "symbol":"property",
      "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
    }
  ]}`)
  if countProblemsContaining(messages, "Out-of-scope @evidence host") != 1 {
    t.Fatalf("expected one consolidated scope diagnostic, got:\n%s", strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "Claim 1 ('types') reference 1")
  assertProblemContains(t, messages, "Claim 2 ('properties') reference 1")
  if countProblemsContaining(messages, "Missing acknowledgement") != 2 {
    t.Fatalf("both independent obligations must stay uncovered:\n%s", strings.Join(messages, "\n"))
  }
}

/**
 * Verifies a globally resolving tag cannot remain outside every owned reference.
 *
 * Resolution indexes the complete graph so two claims can share a source, but
 * that global address table previously let a tag resolve through another
 * claim's reference and then participate in nothing. An exclusion in that state
 * is especially dangerous because it looks like an intentional coverage
 * decision while changing no obligation.
 *
 *  1. Expose one target only through a second claim's reference.
 *  2. Cite it with `@evidenceExclude` from the first claim.
 *  3. Assert the tag is reported as non-participating with its repair context.
 */
func TestResolvedDeclarationMustParticipateInAnOwnedReference(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/owed.md":  "## Owed\n",
    "docs/stray.md": "## Stray\n",
    "src/claim.ts": `
/** @evidenceExclude docs/stray.md#stray This claim intentionally omits the wrong population. */
export interface Claim {}
`,
    "src/other.ts": `
/** @evidence docs/stray.md#stray This claim owns the target. */
export interface Other {}
`,
  }, `{"claims":[
    {
      "name":"claim",
      "type":"typescript",
      "files":["src/claim.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/owed.md"],"symbol":"h2"}
    },
    {
      "name":"other",
      "type":"typescript",
      "files":["src/other.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/stray.md"],"symbol":"h2"}
    }
  ]}`)
  assertProblemContains(t, messages, "Non-participating @evidenceExclude target 'docs/stray.md#stray'")
  assertProblemContains(t, messages, "src/claim.ts:2")
  assertProblemContains(t, messages, "Claim 1 ('claim') across reference 1")
  assertProblemContains(t, messages, "must discharge at least one obligation")
}
