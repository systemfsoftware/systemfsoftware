package evidence

import (
  "encoding/json"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/lint/rule"
)

/**
 * Verifies a configuration diagnostic names the rule whose setting is wrong.
 *
 * `evidence/documented` decodes its options through the helpers `evidence/graph`
 * uses, and those helpers opened every message with the graph's name. A reader
 * with both rules enabled was sent to edit a graph configuration that is not
 * wrong, while the setting that is stays as they left it.
 *
 *  1. Configure `evidence/documented` with a misspelled option key.
 *  2. Run the rule.
 *  3. Assert the message names `evidence/documented` and never the graph.
 */
func TestDocumentedNamesItselfInConfigurationDiagnostics(t *testing.T) {
  messages := runDocumentedRule(t, "src/parse.ts", `
export function parse(value: string): string {
  return value;
}
`, `{"symbols":"type"}`)
  assertReported(t, messages, "Invalid evidence/documented configuration")
  for _, message := range messages {
    if strings.Contains(message, graphRuleName) {
      t.Fatalf("a documented diagnostic named the graph:\n%s", message)
    }
  }
}

/**
 * Verifies an unsupported symbol value also names the owning rule.
 *
 * The symbol decoder is the second shared entry point, and it reports through a
 * different branch than the unknown-key check above. Fixing one and leaving the
 * other would misattribute exactly the configuration a reader is most likely to
 * get wrong, since the Markdown vocabulary decodes cleanly as a string.
 *
 *  1. Configure a Markdown symbol on a TypeScript rule.
 *  2. Run the rule.
 *  3. Assert the message names `evidence/documented`.
 */
func TestDocumentedNamesItselfForUnsupportedSymbols(t *testing.T) {
  messages := runDocumentedRule(t, "src/parse.ts", `
export function parse(value: string): string {
  return value;
}
`, `{"symbol":"h2"}`)
  assertReported(t, messages, "Invalid evidence/documented configuration")
  assertReported(t, messages, "symbol 'h2' is not supported")
}

/**
 * Verifies the graph keeps naming itself.
 *
 * The negative twin of both cases above. Threading an owner through shared
 * decoders is exactly the change that can silently retitle every diagnostic of
 * the rule that was already correct.
 *
 *  1. Configure `evidence/graph` with a misspelled property.
 *  2. Run the project rule.
 *  3. Assert the message still names `evidence/graph`.
 */
func TestGraphKeepsNamingItselfInConfigurationDiagnostics(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/sale.ts":  "export interface ISale { id: string; }\n",
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/sale.ts"],
    "symbolz":"type",
    "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
  }]}`)
  assertProblemContains(t, messages, "Invalid evidence/graph configuration at claims[0].symbolz")
}

/**
 * Verifies the graph's migration hints stay on the graph.
 *
 * `sources` and `citedBy` are properties only the graph ever had. Offering their
 * migration advice to another rule would tell a reader to move a setting into
 * `reference`, on a rule that has no references at all.
 *
 *  1. Configure `evidence/documented` with the retired graph property names.
 *  2. Run the rule.
 *  3. Assert they are reported as plain unknown keys, with no migration advice.
 */
func TestDocumentedDoesNotOfferTheGraphsMigrationHints(t *testing.T) {
  messages := runDocumentedRule(t, "src/parse.ts", `
export function parse(value: string): string {
  return value;
}
`, `{"sources":"src"}`)
  assertReported(t, messages, "unknown property; expected only symbol")
  for _, message := range messages {
    if strings.Contains(message, "declare 'claims'") ||
      strings.Contains(message, "this relation was inverted") {
      t.Fatalf("a documented diagnostic offered a graph migration:\n%s", message)
    }
  }
}

type documentedCycleResults struct {
  state *graphCycleState
}

func (results documentedCycleResults) ProjectResult(
  name string,
) rule.ProjectRuleResult {
  if name != graphRuleName {
    return rule.ProjectRuleResult{Status: rule.ProjectRuleAbsent}
  }
  return rule.NewProjectRuleResult(
    rule.ProjectRuleFailed,
    results.state,
    nil,
    nil,
  )
}

/**
 * Verifies documented configuration failures are emitted once per graph cycle.
 *
 * File rules run in parallel and decode the same global option once per source
 * file. The graph project state is the cycle-scoped rendezvous available to
 * contributors, so one state must deduplicate peers while a fresh watch cycle
 * must be able to report the same still-invalid option again.
 *
 *  1. Check two files against one invalid option and one cycle state.
 *  2. Repeat with a fresh cycle state.
 *  3. Assert each cycle reports exactly once and the later cycle recovers.
 */
func TestDocumentedConfigurationReportsOnceAndRecoversNextCycle(t *testing.T) {
  runCycle := func(state *graphCycleState, options string) []string {
    messages := []string{}
    for _, name := range []string{"alpha.ts", "beta.ts"} {
      file := parseTestSourceFile(
        t,
        "src/"+name,
        "/** Documented. */\nexport interface Contract {}\n",
      )
      reporter := &capturedFileReporter{}
      documentedRule{}.Check(
        rule.NewContextWithProjectResults(
          file,
          nil,
          rule.SeverityError,
          json.RawMessage(options),
          reporter,
          documentedCycleResults{state: state},
        ),
        file.AsNode(),
      )
      messages = append(messages, reporter.messages...)
    }
    return messages
  }

  first := runCycle(&graphCycleState{}, `{"symbols":"type"}`)
  assertReported(t, first, "Invalid evidence/documented configuration")
  second := runCycle(&graphCycleState{}, `{"symbols":"type"}`)
  assertReported(t, second, "Invalid evidence/documented configuration")
  repaired := runCycle(&graphCycleState{}, `{"symbol":"type"}`)
  if countProblemsContaining(repaired, "Invalid evidence/documented configuration") != 0 {
    t.Fatalf("a repaired later cycle retained the invalid finding:\n%s", strings.Join(repaired, "\n"))
  }
}
