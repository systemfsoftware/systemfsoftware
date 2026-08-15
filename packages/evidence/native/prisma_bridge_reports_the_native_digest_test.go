package evidence

import (
  "os"
  "path/filepath"
  "strings"
  "testing"
)

// prismaBridgeRoot materializes a project the real Node bridge can load from.
//
// The directory lives under `tests/test-evidence` rather than in the system
// temp area, because the bridge resolves `@ttsc/evidence` by
// name from the root it is handed. That name resolves in exactly one place in
// this workspace — the feature suite's `node_modules`, which pnpm links to this
// package — and a directory outside the workspace cannot see it at all.
//
// Nothing here installs a Prisma parser into that root, and that is deliberate:
// it is the layout every real consumer has, because neither `prisma` nor
// `@prisma/client` depends on one. These cases therefore exercise the fallback
// to the plugin's own pinned parser, which is the path almost every build takes.
func prismaBridgeRoot(t *testing.T, files map[string]string) string {
  t.Helper()
  suite := filepath.Join("..", "..", "..", "tests", "test-evidence")
  if _, err := os.Stat(filepath.Join(suite, "node_modules", "@ttsc", "evidence")); err != nil {
    t.Fatalf("the feature suite must link this package before the bridge can be exercised; run `pnpm install`: %v", err)
  }
  if _, err := os.Stat(filepath.Join("..", "lib", "internal", "loadPrismaModels.js")); err != nil {
    t.Fatalf("the bridge loader must be compiled before it can be exercised; run `pnpm build`: %v", err)
  }
  created, err := os.MkdirTemp(suite, "prisma-bridge-")
  if err != nil {
    t.Fatal(err)
  }
  t.Cleanup(func() { _ = os.RemoveAll(created) })
  // Absolute, because the bridge builds a `createRequire` base from this and
  // Node rejects a relative one. Every production caller resolves the project
  // root through `filepath.Abs` for the same reason.
  root, err := filepath.Abs(created)
  if err != nil {
    t.Fatal(err)
  }
  for relative, content := range files {
    absolute := filepath.Join(root, filepath.FromSlash(relative))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  return root
}

func mustGlobSet(t *testing.T, patterns []string) globSet {
  t.Helper()
  globs, err := newGlobSet(patterns)
  if err != nil {
    t.Fatal(err)
  }
  return globs
}

const prismaBridgeSchema = `datasource db {
  provider = "postgresql"
}

/// A sale.
model Sale {
  id        String @id @db.Uuid
  price     Int
  seller_id String @db.Uuid
  seller    Seller @relation(fields: [seller_id], references: [id])
}

model Seller {
  id    String @id @db.Uuid
  sales Sale[]
}
`

/**
 * Verifies the loader reports the same digest the native side computes for the
 * same set.
 *
 * This is the one part of the cache that fails in total silence. The two halves
 * hash in different languages — Go over the bytes it read, Node over the bytes
 * it read — and if they ever disagree, every lookup misses, every cycle spawns,
 * and every result stays correct. Nothing goes red; the feature simply stops
 * existing, and no test of either half alone would notice.
 *
 * It runs the real bridge rather than a stand-in, because a stand-in would be
 * this repository agreeing with itself about a composition question only the
 * two real implementations can settle.
 *
 *  1. Parse a two-file set through the actual Node bridge.
 *  2. Compose the same set's digest natively.
 *  3. Assert the two agree and are not empty.
 */
func TestPrismaBridgeReportsTheNativeDigest(t *testing.T) {
  sources := []string{"prisma/schema.prisma", "prisma/seller.prisma"}
  root := prismaBridgeRoot(t, map[string]string{
    sources[0]: prismaBridgeSchema,
    sources[1]: "model Extra {\n  id String @id @db.Uuid\n}\n",
  })
  result, err := normalizePrismaSet(root, sources)
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 {
    t.Fatalf("expected one parsed set, got %d (%v)", len(result.Documents), result.Problems)
  }
  native := prismaContentDigest(root, sources)
  if native == "" {
    t.Fatal("the native side must hash a readable set")
  }
  if result.Documents[0].Digest != native {
    t.Fatalf(
      "the bridge and the native side must compose the same key\n  bridge: %q\n  native: %q",
      result.Documents[0].Digest,
      native,
    )
  }
}

/**
 * Verifies the real parser classifies stored columns and relation fields the
 * way this graph addresses them.
 *
 * The classification is the entire reason the parser is asked at all. A
 * back-reference such as `Seller.sales` carries no attribute in the schema
 * text, so nothing short of Prisma's own resolution can tell it from a scalar —
 * and getting it wrong would put a virtual field into a column population, or
 * drop a relation out of a relation population, with the schema perfectly
 * valid either way.
 *
 *  1. Parse a schema holding a scalar, a foreign key column, and both sides of
 *     one relation.
 *  2. Materialize its units.
 *  3. Assert each member landed in the symbol it is written as.
 */
func TestPrismaBridgeClassifiesColumnsAndRelations(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": prismaBridgeSchema,
  })
  result, err := normalizePrismaSet(root, []string{"prisma/schema.prisma"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 {
    t.Fatalf("expected one parsed set, got %v", result.Problems)
  }
  index := map[string]string{}
  for _, model := range result.Documents[0].Models {
    for _, unit := range prismaModelUnits(model) {
      index[unit.Target] = unit.Symbol
    }
  }
  for target, symbol := range map[string]string{
    "prisma:Sale":           "model",
    "prisma:Sale.price":     "column",
    "prisma:Sale.seller_id": "column",
    "prisma:Sale.seller":    "relation",
    "prisma:Seller":         "model",
    "prisma:Seller.sales":   "relation",
  } {
    if index[target] != symbol {
      t.Fatalf("%s materialized as %q, want %q", target, index[target], symbol)
    }
  }
}

/**
 * Verifies the real parser returns a view among the datamodel's models.
 *
 * This decides whether a citation on a view can ever work, and the name argues
 * the other way — a view is not a table, and a reader would reasonably expect
 * it beside enums and composite types in some other slice. It does not: Prisma
 * returns it as a model, with the same fields and documentation. Pinning it
 * here is what keeps the diagnostic that lists the hostable kinds honest,
 * because that message is otherwise a claim nothing verifies.
 *
 *  1. Parse a schema declaring a model and a view.
 *  2. Assert both materialize, and that the view's column does too.
 */
func TestPrismaBridgeReturnsAViewAsAModel(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": `datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["views"]
}

model Sale {
  id String @id @db.Uuid
}

/// A projection.
view SaleSummary {
  id    String @unique
  total Int
}
`,
  })
  result, err := normalizePrismaSet(root, []string{"prisma/schema.prisma"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 {
    t.Fatalf("expected one parsed set, got %v", result.Problems)
  }
  index := map[string]string{}
  for _, model := range result.Documents[0].Models {
    for _, unit := range prismaModelUnits(model) {
      index[unit.Target] = unit.Symbol
    }
  }
  for target, symbol := range map[string]string{
    "prisma:Sale":              "model",
    "prisma:SaleSummary":       "model",
    "prisma:SaleSummary.total": "column",
  } {
    if index[target] != symbol {
      t.Fatalf("%s materialized as %q, want %q", target, index[target], symbol)
    }
  }
}

/**
 * Verifies a doc comment reaches the native side intact.
 *
 * A Prisma claim hosts its citations in `///` comments, and the parser is what
 * proves the comment belongs to the declaration rather than to whatever follows
 * it. If the text arrived collapsed, re-wrapped, or attached to the wrong
 * member, a citation would be read against a declaration its author never wrote
 * it on.
 *
 *  1. Parse a schema whose model and column each carry a multi-line doc comment.
 *  2. Assert each documentation string is the comment's own lines, joined.
 */
func TestPrismaBridgeCarriesDocComments(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": `datasource db {
  provider = "postgresql"
}

/// A sale.
/// @evidence docs/spec.md#pricing the sale concept comes from here
model Sale {
  id String @id @db.Uuid

  /// @evidence docs/spec.md#amounts the amount is stored here
  price Int
}
`,
  })
  result, err := normalizePrismaSet(root, []string{"prisma/schema.prisma"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Documents) != 1 || len(result.Documents[0].Models) != 1 {
    t.Fatalf("expected one model, got %v / %v", result.Documents, result.Problems)
  }
  model := result.Documents[0].Models[0]
  if model.Documentation != "A sale.\n@evidence docs/spec.md#pricing the sale concept comes from here" {
    t.Fatalf("model documentation: %q", model.Documentation)
  }
  for _, field := range model.Fields {
    if field.Name != "price" {
      continue
    }
    if field.Documentation != "@evidence docs/spec.md#amounts the amount is stored here" {
      t.Fatalf("column documentation: %q", field.Documentation)
    }
    return
  }
  t.Fatal("the documented column must survive the boundary")
}

/**
 * Verifies a schema the parser refuses comes back as a rejection that names its
 * line.
 *
 * The success payload carries no position for anything, so a rejection is the
 * one place a location survives — and it is exactly when an author needs one.
 * The colour codes Prisma writes into that report have to go, because a
 * diagnostic stream is not a terminal, while the text around them has to stay,
 * because it is the only thing that says where.
 *
 *  1. Parse a schema with an invalid field declaration.
 *  2. Assert it lands as a problem rather than an empty success.
 *  3. Assert the message names the line and carries no escape codes.
 */
func TestPrismaBridgeRejectsAnInvalidSchemaWithItsLocation(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": `datasource db {
  provider = "postgresql"
}

model Sale {
  id String @id
  price Int @default(
    0
  )
}
`,
  })
  result, err := normalizePrismaSet(root, []string{"prisma/schema.prisma"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Problems) != 1 || len(result.Documents) != 0 {
    t.Fatalf("an invalid schema must reject, got %d documents", len(result.Documents))
  }
  message := result.Problems[0].Message
  if !strings.Contains(message, "prisma/schema.prisma:7") {
    t.Fatalf("a rejection must name the line the author has to open: %q", message)
  }
  if strings.ContainsRune(message, '\x1b') || strings.Contains(message, "[1;91m") {
    t.Fatalf("a rejection must not carry terminal escape codes: %q", message)
  }
  if result.Problems[0].Digest != prismaContentDigest(root, []string{"prisma/schema.prisma"}) {
    t.Fatal("a rejection must be attributable to the bytes that caused it")
  }
}

/**
 * Verifies a set the bridge cannot read at all reports no digest.
 *
 * There are no bytes to attribute an outcome to, so remembering one would key a
 * result on files that were never read. The native side already declines to
 * hash an unreadable set; this pins the other end of the same rule, so neither
 * side is the only thing standing between a missing schema and the cache.
 *
 *  1. Parse a set naming a file that does not exist.
 *  2. Assert it comes back as a problem.
 *  3. Assert its digest is empty.
 */
func TestPrismaBridgeReportsNoDigestForAnUnreadableSet(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": prismaBridgeSchema,
  })
  result, err := normalizePrismaSet(root, []string{"prisma/absent.prisma"})
  if err != nil {
    t.Fatalf("the bridge must run: %v", err)
  }
  if len(result.Problems) != 1 {
    t.Fatalf("expected one rejected set, got %d", len(result.Problems))
  }
  if result.Problems[0].Digest != "" {
    t.Fatalf("an unread set must carry no digest, got %q", result.Problems[0].Digest)
  }
  if prismaContentDigest(root, []string{"prisma/absent.prisma"}) != "" {
    t.Fatal("the native side must decline to hash a missing file")
  }
}

/**
 * Verifies a rejected set is reported rather than answered as an empty schema.
 *
 * This is the failure the whole loader is shaped to prevent. A rejection that
 * fell through as zero models would leave every obligation of a Prisma
 * reference vacuously satisfied: the build goes green precisely because the
 * schema could not be read.
 *
 *  1. Load the inventories for an unparseable schema through the real loader.
 *  2. Assert a problem is reported.
 *  3. Assert the inventory carries the same problem rather than silent units.
 */
func TestPrismaLoaderReportsAnUnparseableSchema(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": "model Sale {\n  id String @id\n",
  })
  inventories, problems := loadPrismaInventories(root, anchoredGraph(root, graphConfig{
    Claims: []claimSpec{{
      Type:    artifactTypeScript,
      Files:   mustGlobSet(t, []string{"src/**/*.ts"}),
      Symbols: symbolSet{"type": true},
      References: []referenceSpec{{
        Type:    artifactPrisma,
        Files:   mustGlobSet(t, []string{"prisma/**/*.prisma"}),
        Symbols: symbolSet{"model": true},
      }},
    }},
  }))
  if len(problems) == 0 {
    t.Fatal("an unparseable schema must be reported, never answered as an empty population")
  }
  inventory := inventories["prisma/schema.prisma"]
  if inventory == nil {
    t.Fatal("the configured schema must still have an inventory")
  }
  if len(inventory.Units) != 0 {
    t.Fatal("an unparseable schema materializes no units")
  }
  if len(inventory.Problems) == 0 {
    t.Fatal("the inventory must carry the failure so a selecting reference sees it")
  }
  // A reference reads an inventory problem only when it selects that
  // problem's symbol, so a set-wide failure filed under `model` would look
  // problem-free to a reference selecting only columns — which then blames
  // the selector for materializing nothing, on a schema that could not be
  // read at all.
  for _, problem := range inventory.Problems {
    if problem.Symbol != "*" {
      t.Fatalf("a whole-set failure must reach every selector, got symbol %q", problem.Symbol)
    }
  }
}

/**
 * Verifies the loader materializes a located population end to end.
 *
 * Every piece is exercised alone elsewhere; this is the one case that proves
 * they compose — the walk that finds the files, the bridge that classifies
 * them, and the scan that places them. It is also the only place the fallback
 * would show: a unit whose location never resolved would report line 0 here.
 *
 *  1. Load the inventories for a configured schema through the real loader.
 *  2. Assert the model, its column, and its relation all materialized.
 *  3. Assert each carries the file and line it is written on.
 */
func TestPrismaLoaderMaterializesALocatedPopulation(t *testing.T) {
  root := prismaBridgeRoot(t, map[string]string{
    "prisma/schema.prisma": prismaBridgeSchema,
  })
  inventories, problems := loadPrismaInventories(root, anchoredGraph(root, graphConfig{
    Claims: []claimSpec{{
      Type:    artifactTypeScript,
      Files:   mustGlobSet(t, []string{"src/**/*.ts"}),
      Symbols: symbolSet{"type": true},
      References: []referenceSpec{{
        Type:    artifactPrisma,
        Files:   mustGlobSet(t, []string{"prisma/**/*.prisma"}),
        Symbols: symbolSet{"model": true, "column": true, "relation": true},
      }},
    }},
  }))
  if len(problems) != 0 {
    t.Fatalf("a valid schema must load cleanly: %v", problems)
  }
  inventory := inventories["prisma/schema.prisma"]
  if inventory == nil {
    t.Fatal("the configured schema must have an inventory")
  }
  located := map[string]int{}
  for _, unit := range inventory.Units {
    if unit.Path != "prisma/schema.prisma" {
      t.Fatalf("%s filed under %q", unit.Target, unit.Path)
    }
    located[unit.Target] = unit.Line
  }
  for target, line := range map[string]int{
    "prisma:Sale":         6,
    "prisma:Sale.price":   8,
    "prisma:Sale.seller":  10,
    "prisma:Seller":       13,
    "prisma:Seller.sales": 15,
  } {
    if located[target] != line {
      t.Fatalf("%s located at line %d, want %d", target, located[target], line)
    }
  }
}
