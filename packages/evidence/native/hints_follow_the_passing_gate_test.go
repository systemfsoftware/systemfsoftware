package evidence

import (
  "strings"
  "testing"
)

// hintsTypeScriptConfig cites a TypeScript population from TypeScript, which
// is the only claim kind that can address one.
const hintsTypeScriptConfig = `{"claims":[{
  "type":"typescript",
  "files":["src/ledger.ts"],
  "symbol":"type",
  "reference":{"type":"typescript","files":["src/sale.ts"],"symbol":"type"}
}]}`

// hintsSatisfiedLedger acknowledges the exported type, so the graph passes.
const hintsSatisfiedLedger = `import type { ISale } from "./sale";

/** @evidence {@link ISale} Documents the sale contract. */
export interface ILedger {}
`

/**
 * Verifies the corpus is published on a passing project and withdrawn on a
 * failing one.
 *
 * This is the behavior the whole feature is bounded by, and it is the host's
 * rather than ours: `linthost/hints.go:147-149` skips a rule whose snapshot is
 * not `ProjectRulePassed`, and `Report` marks a rule failed unconditionally. So
 * the cycle that reports an unmet obligation is the cycle that withdraws the
 * completions — which is the cycle an author is most likely to be writing a
 * citation in. Pinned here so it is an asserted consequence rather than one
 * inherited silently, and so a future upstream fix shows up as this case
 * changing rather than as behavior drifting unnoticed.
 *
 *  1. Satisfy the graph, and assert a corpus arrives.
 *  2. Remove the acknowledgement so the same graph reports.
 *  3. Assert the report arrives and the corpus does not.
 */
func TestHintsFollowThePassingGate(t *testing.T) {
  satisfied, messages := runGraphHints(t, map[string]string{
    "docs/pricing.md": "## Sale Price {#sale-price}\n",
    "src/sale.ts":     hintsSatisfiedSource,
  }, hintsMarkdownConfig)
  assertSilent(t, messages)
  if len(satisfied) == 0 {
    t.Fatal("a passing graph must publish a corpus")
  }

  withdrawn, failures := runGraphHints(t, map[string]string{
    "docs/pricing.md": "## Sale Price {#sale-price}\n",
    "src/sale.ts":     "export interface ISale {\n  price: number;\n}\n",
  }, hintsMarkdownConfig)
  if len(failures) == 0 {
    t.Fatal("expected the unacknowledged document to be reported")
  }
  if len(withdrawn) != 0 {
    t.Fatalf(
      "a reporting graph publishes no corpus; got %d hints:\n%s",
      len(withdrawn),
      strings.Join(targetInserts(withdrawn), "\n"),
    )
  }
}

/**
 * Verifies an undecodable configuration publishes nothing.
 *
 * The rule reports the configuration error, which fails it, which withdraws the
 * corpus — one consequence rather than a second code path. Pinned so the
 * absence is attributed to the gate rather than read as a decoding quirk.
 *
 *  1. Configure the rule with an unsupported artifact type.
 *  2. Run it.
 *  3. Assert it reports and publishes no corpus.
 */
func TestHintsAreWithheldFromAnUndecodableConfiguration(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "docs/pricing.md": "## Sale Price {#sale-price}\n",
  }, `{"claims":[{"type":"nonsense","files":["docs/**"]}]}`)
  if len(messages) == 0 {
    t.Fatal("expected the configuration to be reported")
  }
  if len(hints) != 0 {
    t.Fatalf("expected no corpus, got %d hints", len(hints))
  }
}

/**
 * Verifies the inline-link entry is offered, unclosed, and first.
 *
 * We cannot narrow TypeScript's completion list — the host merges into the
 * upstream response and never removes from it — so routing the author into it
 * is the only move left. The unclosed form is what makes the routing work: the
 * cursor lands where the language service fires, because `Insert` is verbatim
 * and has no snippet expansion to place it anywhere else.
 *
 *  1. Satisfy a graph whose claim cites a TypeScript reference.
 *  2. Take the published corpus.
 *  3. Assert the entry leads, and inserts `{@link ` with its trailing space.
 */
func TestHintsRouteIntoTypeScriptCompletion(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "src/ledger.ts": hintsSatisfiedLedger,
    "src/sale.ts":   "export interface ISale {\n  price: number;\n}\n",
  }, hintsTypeScriptConfig)
  assertSilent(t, messages)
  cited := targetHintsAt(hints, "@evidence ")
  if len(cited) == 0 {
    t.Fatal("expected a corpus at the citation trigger")
  }
  if cited[0].Insert != "{@link " {
    t.Fatalf("expected the unclosed inline-link opener first, got %q", cited[0].Insert)
  }
  if strings.Contains(cited[0].Insert, "}") {
    t.Fatalf("a closed form parks the cursor past the completion, got %q", cited[0].Insert)
  }
}

/**
 * Verifies the inline-link entry is withheld when nothing cites TypeScript.
 *
 * A graph citing only Markdown cannot resolve an inline-link target, so
 * offering the grammar there hands the author an unresolved-target diagnostic
 * for taking a suggestion. The entry is a projection of the configuration, not
 * a constant.
 *
 *  1. Satisfy a graph whose only reference is Markdown.
 *  2. Take the published corpus.
 *  3. Assert no entry inserts the opener.
 */
func TestHintsWithholdTheLinkEntryWithoutATypeScriptReference(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "docs/pricing.md": "## Sale Price {#sale-price}\n",
    "src/sale.ts":     hintsSatisfiedSource,
  }, hintsMarkdownConfig)
  assertSilent(t, messages)
  for _, hint := range hints {
    if strings.HasPrefix(hint.Insert, "{@link") {
      t.Fatalf("the inline-link entry must be withheld, got %q", hint.Insert)
    }
  }
}

/**
 * Verifies no TypeScript unit is offered as its own entry.
 *
 * TypeScript's language service already lists exactly the symbols in scope at
 * the cursor. A corpus built once per Program cannot know that scope, so an
 * entry per symbol would duplicate a correct list with a worse one — and would
 * survive as a stale suggestion after the symbol moved.
 *
 *  1. Satisfy a graph citing a real exported type.
 *  2. Take the published corpus.
 *  3. Assert the type's name is offered by nothing but the opener.
 */
func TestHintsOfferNoTypeScriptSymbols(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "src/ledger.ts": hintsSatisfiedLedger,
    "src/sale.ts":   "export interface ISale {\n  price: number;\n}\n",
  }, hintsTypeScriptConfig)
  assertSilent(t, messages)
  for _, hint := range hints {
    if hint.Insert == "ISale" {
      t.Fatal("a TypeScript symbol must not be offered as its own entry")
    }
  }
}

/**
 * Verifies disabled claims contribute neither evidence targets nor the
 * TypeScript completion route to a passing sibling's hint corpus.
 *
 * Hints project the corpus after graph evaluation. Filtering diagnostics alone
 * would still advertise staged targets, and a disabled TypeScript reference
 * would still offer an inline-link form that no active obligation can resolve.
 *
 *  1. Disable a claim citing staged Markdown and TypeScript references.
 *  2. Satisfy an enabled claim citing one live Markdown section.
 *  3. Assert only the live target is offered and no inline-link route appears.
 */
func TestDisabledClaimsContributeNoHints(t *testing.T) {
  hints, messages := runGraphHints(t, map[string]string{
    "docs/live.md":   "## Live Requirement {#live}\n",
    "docs/staged.md": "## Staged Requirement {#staged}\n",
    "src/live.ts": `/** @evidence docs/live.md#live Live implementation. */
export interface ILive {}
`,
    "src/staged.ts":    "export interface IStaged {}\n",
    "src/reference.ts": "export interface IReference {}\n",
  }, `{"claims":[
    {
      "type":"typescript",
      "disabled":true,
      "files":["src/staged.ts"],
      "symbol":"type",
      "reference":[
        {
          "type":"markdown",
          "files":["docs/staged.md"],
          "symbol":"h2",
          "noEvidenceExclude":true,
          "uniqueEvidence":true,
          "singleEvidencePerSymbol":true
        },
        {
          "type":"typescript",
          "files":["src/reference.ts"],
          "symbol":"type",
          "noEvidenceExclude":true
        }
      ]
    },
    {
      "type":"typescript",
      "files":["src/live.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/live.md"],"symbol":"h2"}
    }
  ]}`)
  assertSilent(t, messages)
  cited := targetInserts(targetHintsAt(hints, "@evidence "))
  if len(cited) != 1 || cited[0] != "docs/live.md#live" {
    t.Fatalf("disabled claim leaked into hints: %v", cited)
  }
}
