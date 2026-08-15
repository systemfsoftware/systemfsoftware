package evidence

import (
  "encoding/json"
  "os"
  "path/filepath"
  "testing"
)

// decodeInventoryConfig decodes a graph and anchors it, the way Check does.
//
// The anchoring is not incidental. A loader walks a population's resolved base,
// and decoding alone leaves that base empty — so a case that skipped this step
// would exercise a configuration no consumer can produce.
func decodeInventoryConfig(t *testing.T, root string, raw string) graphConfig {
  t.Helper()
  config, problems := decodeGraphConfig(json.RawMessage(raw))
  if len(problems) != 0 {
    t.Fatalf("configuration must decode cleanly, got: %v", problems)
  }
  resolveGraphBases(root, &config)
  return config
}

func writeInventoryFixture(t *testing.T, relative string, content string) string {
  t.Helper()
  root := t.TempDir()
  absolute := filepath.Join(root, filepath.FromSlash(relative))
  if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
    t.Fatal(err)
  }
  if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
    t.Fatal(err)
  }
  return root
}

/**
 * Verifies a graph with no Markdown reference materializes no Markdown units.
 *
 * This pins the result, not the traversal — the pruning itself is pinned by the
 * predicate cases below, because a loader that walked the whole tree and then
 * filtered would satisfy this one just as well.
 *
 *  1. Place a Markdown document in a project.
 *  2. Configure a graph whose only reference is TypeScript.
 *  3. Assert no Markdown inventory materializes.
 */
func TestMarkdownIsNotIndexedWithoutAMarkdownReference(t *testing.T) {
  root := writeInventoryFixture(t, "docs/spec.md", "## Pricing {#pricing}\n")
  inventories, problems := loadMarkdownInventories(root, decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"typescript","files":["src/**"]}
  }]}`))
  if len(problems) != 0 {
    t.Fatalf("expected no problems, got: %v", problems)
  }
  if len(inventories) != 0 {
    t.Fatalf("expected no Markdown inventory, got %d", len(inventories))
  }
}

/**
 * Verifies the negative twin: a declared Markdown reference is indexed.
 *
 * Without it the case above is equally satisfied by a loader that indexes
 * nothing ever, which is the failure mode a pruning optimization actually
 * risks.
 *
 *  1. Place the same document in a project.
 *  2. Configure a Markdown reference selecting it.
 *  3. Assert its headings materialize.
 */
func TestMarkdownIsIndexedWhenReferenced(t *testing.T) {
  root := writeInventoryFixture(t, "docs/spec.md", "## Pricing {#pricing}\n")
  inventories, problems := loadMarkdownInventories(root, decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
  }]}`))
  if len(problems) != 0 {
    t.Fatalf("expected no problems, got: %v", problems)
  }
  if len(inventories) != 1 {
    t.Fatalf("expected one Markdown inventory, got %d", len(inventories))
  }
}

/**
 * Verifies the walk refuses to descend a directory no Markdown glob can reach.
 *
 * This is the pruning contract itself, and it is what keeps a cycle's cost
 * proportional to the declared document tree rather than to the repository. It
 * is a consequence of how the walk is written rather than anything stated, so
 * losing it would cost a full tree traversal per cycle — `node_modules`
 * included — while every result-level case stayed green.
 *
 *  1. Declare a Markdown reference under one directory.
 *  2. Ask the predicate about that directory and about unrelated ones.
 *  3. Assert only the reachable directory may be descended.
 */
func TestMarkdownWalkPrunesUnreachableDirectories(t *testing.T) {
  root := t.TempDir()
  config := decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
  }]}`)
  base := resolvePopulationBase(root, "")
  for _, directory := range []string{"docs", "docs/guides"} {
    if !couldContainConfiguredMarkdown(config, base, directory) {
      t.Fatalf("'%s' can contain a configured document and must be descended", directory)
    }
  }
  for _, directory := range []string{"node_modules", "node_modules/pkg/lib", "src", "lib"} {
    if couldContainConfiguredMarkdown(config, base, directory) {
      t.Fatalf("'%s' can hold no configured document and must be pruned", directory)
    }
  }
}

/**
 * Verifies the pruning predicate refuses every directory when no Markdown is
 * declared.
 *
 * The zero case, and the one that makes a TypeScript-only graph free: with no
 * Markdown reference anywhere in the configuration, the walk has no reason to
 * enter a single directory.
 *
 *  1. Configure a graph with no Markdown on either side.
 *  2. Ask the predicate about the directories a project always has.
 *  3. Assert every one of them is pruned.
 */
func TestMarkdownWalkPrunesEverythingWithoutAMarkdownReference(t *testing.T) {
  root := t.TempDir()
  config := decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"typescript","files":["src/**"]}
  }]}`)
  base := resolvePopulationBase(root, "")
  for _, directory := range []string{"docs", "src", "node_modules", "test"} {
    if couldContainConfiguredMarkdown(config, base, directory) {
      t.Fatalf("'%s' must be pruned when no Markdown is declared", directory)
    }
  }
}

/**
 * Verifies a graph with no Swagger reference never starts the normalizer.
 *
 * Normalization spawns a Node process and loads the converter, which is a fixed
 * toll of roughly a third of a second per cycle regardless of document size. A
 * project that declared no Swagger must not pay it, and the guard that prevents
 * it is one early return away from being lost.
 *
 * The assertion works by pointing the bridge at a binary that cannot exist: a
 * spawn that happens fails loudly, and silence therefore proves no spawn was
 * attempted rather than merely that one succeeded.
 *
 *  1. Point `TTSC_NODE_BINARY` at a nonexistent executable.
 *  2. Load Swagger inventories for a graph referencing only Markdown.
 *  3. Assert no problem is reported.
 */
func TestSwaggerNormalizerIsNotSpawnedWithoutASwaggerReference(t *testing.T) {
  t.Setenv("TTSC_NODE_BINARY", filepath.Join(t.TempDir(), "node-that-does-not-exist"))
  root := writeInventoryFixture(t, "docs/spec.md", "## Pricing {#pricing}\n")
  inventories, problems := loadSwaggerInventories(root, decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
  }]}`))
  if len(problems) != 0 {
    t.Fatalf("expected no normalizer to run, got: %v", problems)
  }
  if len(inventories) != 0 {
    t.Fatalf("expected no Swagger inventory, got %d", len(inventories))
  }
}

/**
 * Verifies the negative twin: a declared Swagger reference does start the
 * normalizer.
 *
 * This is what makes the case above evidence. Under the same unusable binary, a
 * configured Swagger source must fail — proving the guard keys on whether a
 * source was declared, not on the environment happening to be quiet.
 *
 *  1. Point `TTSC_NODE_BINARY` at a nonexistent executable.
 *  2. Load Swagger inventories for a graph that does declare a Swagger source.
 *  3. Assert the normalizer failure is reported against that source.
 */
func TestSwaggerNormalizerIsSpawnedWhenReferenced(t *testing.T) {
  t.Setenv("TTSC_NODE_BINARY", filepath.Join(t.TempDir(), "node-that-does-not-exist"))
  root := writeInventoryFixture(t, "swagger.json", `{"openapi":"3.1.0","paths":{}}`)
  inventories, problems := loadSwaggerInventories(root, decodeInventoryConfig(t, root, `{"claims":[{
    "type":"typescript",
    "files":["src/**"],
    "reference":{"type":"swagger","file":"swagger.json"}
  }]}`))
  if len(problems) == 0 {
    t.Fatal("expected the unusable normalizer to be reported")
  }
  if len(inventories) != 1 {
    t.Fatalf("expected the configured source to still materialize an inventory, got %d", len(inventories))
  }
}
