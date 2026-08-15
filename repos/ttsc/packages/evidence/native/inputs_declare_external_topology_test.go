package evidence

import (
  "encoding/json"
  "testing"

  "github.com/samchon/ttsc/packages/lint/rule"
)

// The host discovers this contract by type assertion and skips a rule that
// fails it (`linthost/project_inputs.go:97-100`), with no warning of any kind.
// A drifted signature would therefore not break a build — it would silently
// stop every watcher this plugin declares, and a rule that watches nothing
// looks exactly like a rule whose sources never changed.
var _ rule.ProjectInputRule = graphRule{}

// declaredInputs runs the published contract the way the host does.
func declaredInputs(t *testing.T, options string) []rule.ProjectInput {
  t.Helper()
  return graphRule{}.ProjectInputs(rule.NewProjectInputContext(
    rule.ProjectIdentity{PhysicalProjectRoot: t.TempDir()},
    rule.SeverityError,
    json.RawMessage(options),
  ))
}

// declaredPatterns lists the declared patterns of one kind, so a case asserts
// the population rather than the order the claims happened to be written in.
func declaredPatterns(
  inputs []rule.ProjectInput,
  kind rule.ProjectInputKind,
) map[string]bool {
  patterns := map[string]bool{}
  for _, input := range inputs {
    if input.Kind == kind {
      patterns[input.Pattern] = true
    }
  }
  return patterns
}

func assertDeclares(
  t *testing.T,
  inputs []rule.ProjectInput,
  kind rule.ProjectInputKind,
  expected []string,
) {
  t.Helper()
  declared := declaredPatterns(inputs, kind)
  if len(declared) != len(expected) {
    t.Fatalf("expected %d %s input(s) %v, got %v", len(expected), kind, expected, declared)
  }
  for _, pattern := range expected {
    if !declared[pattern] {
      t.Fatalf("expected %s input '%s', got %v", kind, pattern, declared)
    }
  }
}

/**
 * Verifies both Markdown sides of a graph are declared as glob populations.
 *
 * A Markdown claim and a Markdown reference are read from disk by the same
 * walk, so both are dependencies — but only the reference side is obvious, and
 * a declaration that covered references alone would leave a claim file's
 * `<!-- @evidence -->` comment editable without any host noticing.
 *
 *  1. Configure a Markdown claim citing a Markdown reference.
 *  2. Publish the rule's project inputs.
 *  3. Assert both glob sets appear, and that nothing was declared as a file.
 */
func TestMarkdownClaimAndReferenceGlobsAreDeclared(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"markdown",
    "files":["docs/ledger/**/*.md"],
    "symbol":"file",
    "reference":{"type":"markdown","files":["docs/spec/**/*.md"],"symbol":"h2"}
  }]}`)
  assertDeclares(t, inputs, rule.ProjectInputGlob, []string{
    "docs/ledger/**/*.md",
    "docs/spec/**/*.md",
  })
  assertDeclares(t, inputs, rule.ProjectInputFile, nil)
}

/**
 * Verifies a local Swagger reference is declared as one exact file.
 *
 * A Swagger reference owns one exact path, so declaring it as a glob would ask
 * the host to maintain a population where a single dependency exists. The kind
 * is what tells the host it must keep watching while the file is missing, which
 * is how a document that has not been generated yet becomes observable the
 * moment it appears.
 *
 *  1. Configure a claim citing a project-relative Swagger document.
 *  2. Publish the rule's project inputs.
 *  3. Assert the document is declared exactly once, as a file.
 */
func TestLocalSwaggerReferenceIsDeclaredAsAFile(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"swagger","file":"assets/swagger.json"}
  }]}`)
  assertDeclares(t, inputs, rule.ProjectInputFile, []string{"assets/swagger.json"})
  assertDeclares(t, inputs, rule.ProjectInputGlob, nil)
}

/**
 * Verifies an HTTP(S) Swagger reference declares no filesystem dependency.
 *
 * The host rejects a remote pattern, and one rejection discards the entire
 * snapshot for every project rule in the run — so a declared URL would not
 * merely fail to help, it would silently un-watch the Markdown globs beside it.
 * That makes this the highest-consequence branch in the contract.
 *
 *  1. Configure one URL Swagger reference beside a Markdown reference.
 *  2. Publish the rule's project inputs.
 *  3. Assert the Markdown glob survives and no file input is declared.
 */
func TestRemoteSwaggerReferenceDeclaresNoFilesystemInput(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":[
      {"type":"swagger","file":"https://example.com/v1/swagger.json"},
      {"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
    ]
  }]}`)
  assertDeclares(t, inputs, rule.ProjectInputFile, nil)
  assertDeclares(t, inputs, rule.ProjectInputGlob, []string{"docs/**/*.md"})
}

/**
 * Verifies an uppercase URL scheme is still recognized as remote.
 *
 * `normalizeSwaggerSource` validates the scheme case-insensitively and then
 * stores the author's spelling, so a source reaches this contract spelled
 * however it was written. A literal `https://` prefix comparison would let
 * `HTTPS://` through and hand the host a pattern it rejects.
 *
 *  1. Configure a Swagger reference whose scheme is uppercase.
 *  2. Publish the rule's project inputs.
 *  3. Assert nothing at all is declared.
 */
func TestUppercaseSwaggerURLSchemeIsRecognizedAsRemote(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"swagger","file":"HTTPS://example.com/v1/swagger.json"}
  }]}`)
  if len(inputs) != 0 {
    t.Fatalf("expected an uppercase scheme to stay remote, got %v", inputs)
  }
}

/**
 * Verifies an exclusion glob is dropped rather than published.
 *
 * The host's dependency model has no negation, so a declared `!docs/private/**`
 * would be read as a population to watch — the exact inverse of what the author
 * wrote. The positive twin in the same case is what proves the filter discards
 * only the exclusion instead of discarding the set.
 *
 *  1. Configure a Markdown reference with one positive and one negative glob.
 *  2. Publish the rule's project inputs.
 *  3. Assert only the positive glob is declared.
 */
func TestExclusionGlobsAreNotDeclaredAsInputs(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{
      "type":"markdown",
      "files":["docs/**/*.md","!docs/private/**"],
      "symbol":"h2"
    }
  }]}`)
  assertDeclares(t, inputs, rule.ProjectInputGlob, []string{"docs/**/*.md"})
}

/**
 * Verifies a declared glob is the compiled form rather than the author's
 * spelling.
 *
 * A pattern is anchored by the host against the physical project root, so a
 * leading `./` or a Windows separator has to be gone before it leaves here.
 * `Raw` preserves both, which is why the segments are what is published.
 *
 *  1. Configure a Markdown reference written with `./` and backslashes.
 *  2. Publish the rule's project inputs.
 *  3. Assert the declared pattern is the normalized project-relative form.
 */
func TestDeclaredGlobsAreNormalizedProjectRelativePatterns(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{
      "type":"markdown",
      "files":["./docs\\guides/**/*.md"],
      "symbol":"h2"
    }
  }]}`)
  assertDeclares(t, inputs, rule.ProjectInputGlob, []string{"docs/guides/**/*.md"})
}

/**
 * Verifies a graph citing only TypeScript declares no external input at all.
 *
 * TypeScript inventories are materialized from the Program the host already
 * watches. Declaring them again would add a second watcher per source file for
 * no freshness the host does not already provide, and the cost of that lands on
 * every consumer whose graph never mentions a document.
 *
 *  1. Configure a TypeScript claim citing a TypeScript reference.
 *  2. Publish the rule's project inputs.
 *  3. Assert the declaration is empty.
 */
func TestTypeScriptOnlyGraphDeclaresNoExternalInput(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"typescript","files":["src/api/**"],"symbol":"type"}
  }]}`)
  if len(inputs) != 0 {
    t.Fatalf("expected a TypeScript-only graph to declare nothing, got %v", inputs)
  }
}

/**
 * Verifies a broken claim neither panics nor silences its healthy siblings.
 *
 * The host runs this contract behind a recover that turns a panic into a
 * snapshot-wide error (`linthost/project_inputs.go:139-149`), so one malformed
 * claim must not be able to un-watch a whole project. Declaring what decoded is
 * also the behavior an author needs most while a configuration is mid-repair.
 *
 *  1. Configure one claim with an unsupported artifact type and one valid claim.
 *  2. Publish the rule's project inputs.
 *  3. Assert the valid claim's glob is declared and nothing panicked.
 */
func TestAnUndecodableClaimStillLeavesItsSiblingsDeclared(t *testing.T) {
  inputs := declaredInputs(t, `{"claims":[
    {"type":"nonsense","files":["docs/**"],"reference":{"type":"markdown","files":["never/**"]}},
    {
      "type":"typescript",
      "files":["src/**"],
      "reference":{"type":"markdown","files":["docs/spec/**/*.md"],"symbol":"h2"}
    }
  ]}`)
  assertDeclares(t, inputs, rule.ProjectInputGlob, []string{"docs/spec/**/*.md"})
}

/**
 * Verifies an entirely unusable options payload declares nothing quietly.
 *
 * `Check` reports the configuration failure with a position and a repair; this
 * contract has no reporter and runs before a Program exists, so its only sound
 * answer is an empty declaration. Returning an error or panicking here would
 * convert one rule's misconfiguration into a failed build for the whole project.
 *
 *  1. Publish project inputs for options that are not an object at all.
 *  2. Repeat for an empty claim array and for absent options.
 *  3. Assert each declares nothing without panicking.
 */
func TestUnusableOptionsDeclareNothingWithoutPanicking(t *testing.T) {
  for _, options := range []string{`"not-an-object"`, `{"claims":[]}`, ``} {
    if inputs := declaredInputs(t, options); len(inputs) != 0 {
      t.Fatalf("expected options %q to declare nothing, got %v", options, inputs)
    }
  }
}

/**
 * Verifies disabled claims publish none of their own or referenced external
 * topology while enabled siblings remain watched.
 *
 * Project inputs run before a Program exists, so filtering only inside
 * `Check` would leave staged Markdown, Prisma, and Swagger populations live in
 * watch mode. Re-enabling the same claim must restore every dependency.
 *
 *  1. Disable a Markdown claim with Prisma and Swagger references beside one
 *     enabled Markdown reference.
 *  2. Assert only the enabled dependency is declared.
 *  3. Flip `disabled` to false and assert every staged dependency returns.
 */
func TestDisabledClaimsDeclareNoProjectInputsUntilEnabled(t *testing.T) {
  configuration := func(disabled string) string {
    return `{"claims":[
      {
        "type":"markdown",
        "disabled":` + disabled + `,
        "root":"staged-docs",
        "files":["claims/**/*.md"],
        "reference":[
          {"type":"prisma","root":"staged-schema","files":["**/*.prisma"]},
          {"type":"swagger","file":"staged/swagger.json"}
        ]
      },
      {
        "type":"typescript",
        "files":["src/**"],
        "reference":{"type":"markdown","files":["docs/live/**/*.md"]}
      }
    ]}`
  }

  disabled := declaredInputs(t, configuration("true"))
  assertDeclares(t, disabled, rule.ProjectInputGlob, []string{"docs/live/**/*.md"})
  assertDeclares(t, disabled, rule.ProjectInputFile, nil)

  enabled := declaredInputs(t, configuration("false"))
  assertDeclares(t, enabled, rule.ProjectInputGlob, []string{
    "staged-docs/claims/**/*.md",
    "staged-schema/**/*.prisma",
    "docs/live/**/*.md",
  })
  assertDeclares(t, enabled, rule.ProjectInputFile, []string{"staged/swagger.json"})
}
