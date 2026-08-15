package evidence

import (
  "encoding/json"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/lint/rule"
)

/**
 * Verifies a disabled claim performs no loading or evaluation while an enabled
 * sibling retains its original diagnostic identity.
 *
 * Filtering after graph loading would still report the disabled claim's
 * unreadable root. Rebuilding the claim slice with new indexes would instead
 * report the enabled sibling as Claim 1, sending the author to the wrong
 * configuration entry.
 *
 *  1. Disable Claim 1 behind an unreadable population root.
 *  2. Leave Claim 2 active with one unacknowledged Markdown section.
 *  3. Assert only the Claim 2 coverage failure survives.
 */
func TestDisabledClaimSkipsLoadingAndPreservesSiblingIndex(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/live.md": "## Live Requirement {#live}\n",
    "src/live.ts":  "export interface ILive {}\n",
  }, `{"claims":[
    {
      "type":"typescript",
      "name":"Staged",
      "disabled":true,
      "root":"missing-source-root",
      "files":["**/*.ts"],
      "reference":{"type":"markdown","root":"missing-reference-root","files":["**/*.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "name":"Live",
      "files":["src/live.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/live.md"],"symbol":"h2"}
    }
  ]}`)
  if len(messages) != 1 {
    t.Fatalf("expected only the enabled coverage failure, got:\n%s", strings.Join(messages, "\n"))
  }
  if !strings.Contains(messages[0], "Claim 2 ('Live')") ||
    !strings.Contains(messages[0], "Missing acknowledgement") {
    t.Fatalf("enabled sibling lost its original identity: %s", messages[0])
  }
  if strings.Contains(messages[0], "missing-source-root") ||
    strings.Contains(messages[0], "missing-reference-root") {
    t.Fatalf("disabled loaders leaked a diagnostic: %s", messages[0])
  }
}

/**
 * Verifies disabling one obligation cannot satisfy another with declarations
 * from the disabled claim's population.
 *
 * Evidence coverage is claim-local even when references select the same
 * target. A declaration that exists only in a disabled claim must disappear
 * with that claim rather than covering an enabled sibling by accident.
 *
 *  1. Let a disabled claim acknowledge the shared requirement.
 *  2. Leave an enabled sibling that cites the same requirement unacknowledged.
 *  3. Assert the enabled obligation still fails.
 */
func TestDisabledClaimCannotCoverAnEnabledSibling(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/requirement.md": "## Shared Requirement {#shared}\n",
    "src/staged.ts": `/** @evidence docs/requirement.md#shared Staged implementation. */
export interface IStaged {}
`,
    "src/live.ts": "export interface ILive {}\n",
  }, `{"claims":[
    {
      "type":"typescript",
      "disabled":true,
      "files":["src/staged.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/requirement.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/live.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/requirement.md"],"symbol":"h2"}
    }
  ]}`)
  if len(messages) != 1 || !strings.Contains(messages[0], "Claim 2") ||
    !strings.Contains(messages[0], "Missing acknowledgement") {
    t.Fatalf("disabled evidence contaminated its enabled sibling:\n%s", strings.Join(messages, "\n"))
  }
}

/**
 * Verifies references owned only by a disabled claim contribute no resolvable
 * targets to an enabled sibling.
 *
 * Target lookup is assembled globally from active obligations. Filtering only
 * during coverage would leave a disabled reference addressable and turn a
 * genuinely unresolved declaration into a misleading participation failure.
 *
 *  1. Disable the only claim that references a staged Markdown section.
 *  2. Cite that staged section beside a valid citation in an enabled claim.
 *  3. Assert the staged target is unresolved rather than leaked globally.
 */
func TestDisabledClaimContributesNoResolvableTargets(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/live.md":   "## Live Requirement {#live}\n",
    "docs/staged.md": "## Staged Requirement {#staged}\n",
    "src/staged.ts":  "export interface IStaged {}\n",
    "src/live.ts": `/**
 * @evidence docs/live.md#live Live implementation.
 * @evidence docs/staged.md#staged Must not resolve through a disabled claim.
 */
export interface ILive {}
`,
  }, `{"claims":[
    {
      "type":"typescript",
      "disabled":true,
      "files":["src/staged.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/staged.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/live.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/live.md"],"symbol":"h2"}
    }
  ]}`)
  if len(messages) != 1 ||
    !strings.Contains(messages[0], "Unresolved evidence target 'docs/staged.md#staged'") {
    t.Fatalf("disabled reference leaked into target resolution:\n%s", strings.Join(messages, "\n"))
  }
}

/**
 * Verifies claim-local disabling does not suppress a source selected by an
 * enabled overlapping claim.
 *
 * `disabled` removes an obligation, not a physical file. Filtering shared
 * inventories by path would make the enabled claim vanish merely because a
 * disabled claim selected the same source.
 *
 *  1. Select one source from disabled and enabled claims.
 *  2. Satisfy only the enabled claim's live reference.
 *  3. Assert the enabled overlapping obligation is evaluated and passes.
 */
func TestDisabledClaimDoesNotSuppressAnEnabledOverlappingSource(t *testing.T) {
  assertNoProblems(t, runIndexRule(t, map[string]string{
    "docs/live.md": "## Live Requirement {#live}\n",
    "src/shared.ts": `/** @evidence docs/live.md#live Live implementation. */
export interface IShared {}
`,
  }, `{"claims":[
    {
      "type":"typescript",
      "disabled":true,
      "files":["src/shared.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","root":"missing-reference-root","files":["**/*.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/shared.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/live.md"],"symbol":"h2"}
    }
  ]}`))
}

/**
 * Verifies an all-disabled configuration publishes a clean, empty graph
 * corpus without requiring any project or population path to exist.
 *
 * Staged authoring begins with every claim disabled. Treating that state like
 * an empty `claims` array would reject the workflow, while resolving roots
 * before the gate would still produce loader failures.
 *
 *  1. Configure one disabled claim under unreadable roots.
 *  2. Run the project rule with no source population.
 *  3. Assert it passes and publishes an empty corpus and no hints.
 */
func TestAllDisabledClaimsPublishACleanEmptyCorpus(t *testing.T) {
  reporter := &capturedProjectReporter{}
  context := rule.NewProjectContext(
    rule.ProjectIdentity{},
    nil,
    nil,
    rule.SeverityError,
    json.RawMessage(`{"claims":[{
      "type":"typescript",
      "disabled":true,
      "root":"missing-source-root",
      "files":["**/*.ts"],
      "reference":{"type":"markdown","root":"missing-reference-root","files":["**/*.md"]}
    }]}`),
    reporter,
  )
  graphRule{}.Check(context)
  if reporter.failed || len(reporter.messages) != 0 {
    t.Fatalf("all-disabled graph must pass cleanly: %v", reporter.messages)
  }
  cycle, ok := reporter.state.(*graphCycleState)
  if !ok || cycle == nil {
    t.Fatalf("all-disabled graph did not publish its cycle state: %T", reporter.state)
  }
  if len(cycle.Corpus.Config.Claims) != 0 ||
    len(cycle.Corpus.Markdown) != 0 ||
    len(cycle.Corpus.Prisma) != 0 ||
    len(cycle.Corpus.Swagger) != 0 {
    t.Fatalf("all-disabled graph published a non-empty corpus: %+v", cycle.Corpus)
  }
  if hints := (graphRule{}).Hints(&rule.HintContext{State: cycle}); len(hints) != 0 {
    t.Fatalf("all-disabled graph published %d hint(s)", len(hints))
  }
}
