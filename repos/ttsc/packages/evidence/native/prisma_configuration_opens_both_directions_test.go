package evidence

import (
  "strings"
  "testing"
)

func decodePrismaConfig(t *testing.T, raw string) (graphConfig, []string) {
  t.Helper()
  return decodeGraphConfig([]byte(raw))
}

/**
 * Verifies a Prisma schema decodes as a claim and as a reference.
 *
 * Prisma joins Markdown and TypeScript as an artifact that works in both
 * directions, and Swagger stays the only evidence-only kind. Both halves matter
 * to the product: a model citing the requirement that asked for it, and a
 * provider citing the model it persists.
 *
 *  1. Configure a Prisma claim citing Markdown and a TypeScript claim citing
 *     Prisma.
 *  2. Decode the configuration.
 *  3. Assert both decode with the artifact kinds they named.
 */
func TestPrismaConfigurationOpensBothDirections(t *testing.T) {
  config, problems := decodePrismaConfig(t, `{"claims":[
    {
      "type":"prisma",
      "name":"Every model justifies itself",
      "files":["prisma/schema/**/*.prisma"],
      "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/providers/**/*.ts"],
      "symbol":"function",
      "reference":{"type":"prisma","files":["prisma/schema/**/*.prisma"]}
    }
  ]}`)
  if len(problems) != 0 {
    t.Fatalf("both directions must decode: %v", problems)
  }
  if len(config.Claims) != 2 {
    t.Fatalf("expected two claims, got %d", len(config.Claims))
  }
  if config.Claims[0].Type != artifactPrisma {
    t.Fatalf("a Prisma claim must decode as one, got %q", config.Claims[0].Type)
  }
  if config.Claims[1].References[0].Type != artifactPrisma {
    t.Fatalf("a Prisma reference must decode as one, got %q", config.Claims[1].References[0].Type)
  }
}

/**
 * Verifies the two sides default to different selections.
 *
 * A reference default is a promise about the denominator, so it takes the
 * coarsest one: selecting every column by default would put `id`, `created_at`,
 * and every back-reference into the obligation set, and a denominator that
 * large teaches an author to write filler reasons. A claim default is the
 * widest, because there the selector narrows where a citation may sit rather
 * than what must be covered.
 *
 *  1. Decode a Prisma claim and reference with no `symbol`.
 *  2. Assert the reference selects models alone.
 *  3. Assert the claim selects all three host kinds.
 */
func TestPrismaConfigurationDefaultsDifferPerSide(t *testing.T) {
  config, problems := decodePrismaConfig(t, `{"claims":[{
    "type":"prisma",
    "files":["prisma/**/*.prisma"],
    "reference":{"type":"prisma","files":["prisma/**/*.prisma"]}
  }]}`)
  if len(problems) != 0 {
    t.Fatalf("defaults must decode: %v", problems)
  }
  if got := config.Claims[0].References[0].Symbols.names(); got != "model" {
    t.Fatalf("reference default: %q, want \"model\"", got)
  }
  if got := config.Claims[0].Symbols.names(); got != "model, column, relation" {
    t.Fatalf("claim default: %q, want \"model, column, relation\"", got)
  }
}

/**
 * Verifies every member kind can be selected explicitly.
 *
 * The default is a default, not a ceiling. A DTO field or a provider that
 * materializes one exact column should be able to cite that column, and the
 * only thing standing between a citation and its target is this selector —
 * an unselected member is not addressable at all.
 *
 *  1. Select all three kinds on a reference.
 *  2. Assert the selection decodes intact.
 */
func TestPrismaConfigurationSelectsMembersExplicitly(t *testing.T) {
  config, problems := decodePrismaConfig(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{
      "type":"prisma",
      "files":["prisma/**/*.prisma"],
      "symbol":["model","column","relation"]
    }
  }]}`)
  if len(problems) != 0 {
    t.Fatalf("an explicit member selection must decode: %v", problems)
  }
  if got := config.Claims[0].References[0].Symbols.names(); got != "model, column, relation" {
    t.Fatalf("selection: %q", got)
  }
}

/**
 * Verifies a symbol from another artifact kind is rejected by name.
 *
 * Symbol sets are per artifact kind, and a Markdown or TypeScript symbol on a
 * Prisma selector would otherwise select nothing at all — a reference with an
 * empty denominator, which passes every obligation it has.
 *
 *  1. Select a TypeScript symbol on a Prisma reference.
 *  2. Assert the rejection names the kind and lists what is supported.
 */
func TestPrismaConfigurationRejectsAForeignSymbol(t *testing.T) {
  _, problems := decodePrismaConfig(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"prisma","files":["prisma/**"],"symbol":"type"}
  }]}`)
  assertProblemContains(t, problems, "symbol 'type' is not supported for prisma")
}

/**
 * Verifies the Swagger-only and TypeScript-only selectors stay Swagger-only and
 * TypeScript-only.
 *
 * A Prisma schema folder is several files forming one namespace, so it takes
 * `files` globs like Markdown rather than Swagger's singular `file`; and it
 * lives in this project, so it cannot select an installed package. Accepting
 * either quietly would select nothing while reading as a configured
 * population.
 *
 *  1. Configure a Prisma reference with `file`, then with `package`.
 *  2. Assert each is rejected with the message that owns it.
 */
func TestPrismaConfigurationRejectsSelectorsItDoesNotOwn(t *testing.T) {
  _, singular := decodePrismaConfig(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"prisma","file":"prisma/schema.prisma"}
  }]}`)
  assertProblemContains(t, singular, "singular 'file' is only supported by Swagger references")

  _, packaged := decodePrismaConfig(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"prisma","package":"@scope/name","files":["prisma/**"]}
  }]}`)
  assertProblemContains(t, packaged, "only a TypeScript reference can select an installed package")
}

/**
 * Verifies the unsupported-artifact message lists Prisma on both sides.
 *
 * Most users meet a configuration surface through the error that rejects their
 * first attempt, so a message that omits a supported kind is how a feature
 * stays unused. Swagger remains evidence-only, and its own message has to stay
 * accurate about what a claim may be.
 *
 *  1. Name an unsupported kind as a claim and as a reference.
 *  2. Assert both messages list Prisma among the supported kinds.
 *  3. Assert the Swagger-as-claim message lists it too.
 */
func TestPrismaConfigurationIsOfferedInDiagnostics(t *testing.T) {
  _, claim := decodePrismaConfig(t, `{"claims":[{
    "type":"graphql",
    "files":["schema.graphql"],
    "reference":{"type":"markdown","files":["docs/**"]}
  }]}`)
  assertProblemContains(t, claim, "expected 'markdown', 'prisma', or 'typescript'")

  _, reference := decodePrismaConfig(t, `{"claims":[{
    "type":"typescript",
    "files":["src/**/*.ts"],
    "reference":{"type":"graphql","files":["schema.graphql"]}
  }]}`)
  assertProblemContains(t, reference, "expected 'markdown', 'prisma', 'swagger', or 'typescript'")

  _, swagger := decodePrismaConfig(t, `{"claims":[{
    "type":"swagger",
    "files":["swagger.json"],
    "reference":{"type":"markdown","files":["docs/**"]}
  }]}`)
  assertProblemContains(t, swagger, "expected 'markdown', 'prisma', or 'typescript'")
}

/**
 * Verifies a Prisma glob set is declared to the host as an external input.
 *
 * A `.prisma` file never enters the TypeScript Program, so the watch topology
 * and the editor server cannot learn the graph depends on one unless the rule
 * says so. The failure without this declaration is silent in the worst
 * direction: a developer editing code sees fresh diagnostics because the
 * TypeScript event drives a cycle that reloads the schema too, while a
 * developer editing only the schema keeps reading a green result for a citation
 * that has already gone stale.
 *
 *  1. Configure a Prisma claim and a Prisma reference.
 *  2. Collect the declared project inputs.
 *  3. Assert both glob sets are declared, and that an exclusion is not.
 */
func TestPrismaGlobsAreDeclaredAsProjectInputs(t *testing.T) {
  config, problems := decodePrismaConfig(t, `{"claims":[{
    "type":"prisma",
    "files":["prisma/schema/**/*.prisma","!prisma/schema/legacy/**"],
    "reference":{"type":"prisma","files":["other/**/*.prisma"]}
  }]}`)
  if len(problems) != 0 {
    t.Fatalf("the configuration must decode: %v", problems)
  }
  declared := []string{}
  for _, input := range graphProjectInputs(config) {
    declared = append(declared, string(input.Kind)+":"+input.Pattern)
  }
  joined := strings.Join(declared, "\n")
  for _, expected := range []string{
    "prisma/schema/**/*.prisma",
    "other/**/*.prisma",
  } {
    if !strings.Contains(joined, expected) {
      t.Fatalf("a configured Prisma glob must be watched, missing %q in:\n%s", expected, joined)
    }
  }
  // The host's dependency model has no negation, so an exclusion would ask it
  // to watch precisely the files this graph refuses to read.
  if strings.Contains(joined, "legacy") {
    t.Fatalf("an exclusion must not be declared:\n%s", joined)
  }
}
