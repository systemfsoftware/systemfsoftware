package evidence

import (
  "os"
  "path/filepath"
  "sort"
  "strings"
  "testing"
)

func prismaLocationsOf(content string) map[string]prismaLocation {
  locations := map[string]prismaLocation{}
  scanPrismaFile("prisma/schema.prisma", content, locations)
  return locations
}

// prismaCommentsOf renders each scanned comment run as
// `form@line->key: body`, so a case can assert attachment and grouping in one
// comparison instead of reaching into the slice.
func prismaCommentsOf(content string) string {
  scan := scanPrismaFile(
    "prisma/schema.prisma",
    content,
    map[string]prismaLocation{},
  )
  // Ordered by starting line so a case reads in file order rather than in
  // whatever order grouping happened to append.
  runs := append([]prismaCommentRun(nil), scan.Comments...)
  sort.SliceStable(runs, func(left int, right int) bool {
    return runs[left].Line < runs[right].Line
  })
  rendered := make([]string, 0, len(runs))
  for _, run := range runs {
    rendered = append(rendered, string(run.Form)+"@"+decimal(run.Line)+"->"+run.Key+": "+strings.ReplaceAll(run.Body, "\n", "|"))
  }
  return strings.Join(rendered, "\n")
}

func assertPrismaLine(
  t *testing.T,
  locations map[string]prismaLocation,
  key string,
  line int,
) {
  t.Helper()
  found, exists := locations[key]
  if !exists {
    t.Fatalf("%q was not located; found %v", key, prismaLocationKeys(locations))
  }
  if found.Line != line {
    t.Fatalf("%q located at line %d, want %d", key, found.Line, line)
  }
}

func prismaLocationKeys(locations map[string]prismaLocation) []string {
  keys := make([]string, 0, len(locations))
  for key := range locations {
    keys = append(keys, key)
  }
  return keys
}

/**
 * Verifies a model and its members each report the line they are written on.
 *
 * Prisma's parser returns no position for anything, so every location this
 * graph reports comes from here. A member attributed to the wrong block would
 * point an author at another model's field, which is worse than pointing at the
 * file: a wrong location reads as authoritative.
 *
 *  1. Scan a schema with two models and members in both.
 *  2. Assert each name's line.
 *  3. Assert the second model's member did not attach to the first model.
 */
func TestPrismaLocatesModelsAndMembers(t *testing.T) {
  locations := prismaLocationsOf(`datasource db {
  provider = "postgresql"
}

model Sale {
  id     String @id
  seller Seller @relation(fields: [id], references: [id])
}

model Seller {
  id String @id
}
`)
  assertPrismaLine(t, locations, "Sale", 5)
  assertPrismaLine(t, locations, "Sale.id", 6)
  assertPrismaLine(t, locations, "Sale.seller", 7)
  assertPrismaLine(t, locations, "Seller", 10)
  assertPrismaLine(t, locations, "Seller.id", 11)
  if _, leaked := locations["Sale.provider"]; leaked {
    t.Fatal("a datasource setting must not be read as a model member")
  }
  if _, leaked := locations["db.provider"]; leaked {
    t.Fatal("a datasource owns no addressable member")
  }
}

/**
 * Verifies a brace inside a string literal does not close the block.
 *
 * `@default("}")` is a legal column, and a scan that counted braces literally
 * would end the model there — silently moving every member below it out of the
 * block and, if another block follows, attributing them to it. The result is a
 * location that is wrong rather than missing, on a schema that is perfectly
 * valid.
 *
 *  1. Scan a model whose column defaults to a closing brace.
 *  2. Assert the members after it still belong to that model.
 */
func TestPrismaBraceInsideAStringDoesNotCloseTheBlock(t *testing.T) {
  locations := prismaLocationsOf(`model Sale {
  note  String @default("}")
  price Int
}
`)
  assertPrismaLine(t, locations, "Sale.note", 2)
  assertPrismaLine(t, locations, "Sale.price", 3)
}

/**
 * Verifies comments never contribute a declaration and never end a block early.
 *
 * All three comment forms reach the scan, and each can lie in its own way: a
 * `//` line holding schema-shaped text would be read as a member, a `///` doc
 * line likewise, and a block comment containing a brace would close the model
 * from inside a comment. Prisma keeps block-comment text as documentation, so
 * it is genuinely present in the file the author sees, which is why it is
 * pinned rather than assumed away.
 *
 *  1. Scan a model whose members are separated by all three comment forms.
 *  2. Assert only the real members are located.
 *  3. Assert the commented-out member contributed nothing.
 */
func TestPrismaCommentsDeclareNothing(t *testing.T) {
  locations := prismaLocationsOf(`model Sale {
  id String @id
  // retired Int
  /// a doc comment
  /* a block
     comment with } inside */
  price Int
}
`)
  assertPrismaLine(t, locations, "Sale.id", 2)
  assertPrismaLine(t, locations, "Sale.price", 7)
  for _, absent := range []string{"Sale.retired", "Sale.a", "Sale.comment"} {
    if _, leaked := locations[absent]; leaked {
      t.Fatalf("%q came from a comment", absent)
    }
  }
}

/**
 * Verifies a member named after a block keyword is still a member.
 *
 * `model String` is a legal column, and a scan that recognized a block opener
 * by its first word alone would read it as the start of a nested model. Nothing
 * downstream would notice: the real model's remaining members would attach to a
 * block that does not exist.
 *
 *  1. Scan a model with a column named `model` and one named `type`.
 *  2. Assert both are located as members of the enclosing model.
 */
func TestPrismaMemberNamedLikeAKeywordStaysAMember(t *testing.T) {
  locations := prismaLocationsOf(`model Sale {
  id    String @id
  model String
  type  String
  price Int
}
`)
  assertPrismaLine(t, locations, "Sale.model", 3)
  assertPrismaLine(t, locations, "Sale.type", 4)
  assertPrismaLine(t, locations, "Sale.price", 5)
}

/**
 * Verifies a block attribute is not a member.
 *
 * `@@index([a, b])` opens with `@` rather than an identifier, so reading its
 * first token as a name would invent a member no reference can select and no
 * citation can discharge.
 *
 *  1. Scan a model carrying block attributes.
 *  2. Assert the real members are located and the attributes are not.
 */
func TestPrismaBlockAttributeIsNotAMember(t *testing.T) {
  locations := prismaLocationsOf(`model Sale {
  id    String @id
  price Int

  @@index([price])
  @@map("sales")
}
`)
  assertPrismaLine(t, locations, "Sale.price", 3)
  for key := range locations {
    if strings.HasPrefix(key, "Sale.@") {
      t.Fatalf("%q is a block attribute, not a member", key)
    }
  }
}

/**
 * Verifies a unicode identifier is located.
 *
 * Prisma's grammar admits any unicode alphanumeric in an identifier, and a
 * scanner written against ASCII would drop such a model entirely — leaving a
 * unit the parser did return with a file-level location, in the one codebase
 * shape where every model is spelled that way.
 *
 *  1. Scan a model whose name and member are non-ASCII.
 *  2. Assert both are located.
 */
func TestPrismaLocatesUnicodeIdentifiers(t *testing.T) {
  locations := prismaLocationsOf(`model 판매 {
  식별자 String @id
}
`)
  assertPrismaLine(t, locations, "판매", 1)
  assertPrismaLine(t, locations, "판매.식별자", 2)
}

/**
 * Verifies CRLF input reports the same lines as LF input.
 *
 * The plugin is developed on Windows and consumed on both, and a schema
 * committed with CRLF is ordinary. A scan that kept the carriage return would
 * still count lines correctly, so the failure would not be a wrong line but a
 * name that never matches — every unit silently falling back to a file-level
 * location on exactly one platform's checkout.
 *
 *  1. Scan one schema twice, with LF and with CRLF.
 *  2. Assert the two answer identically.
 */
func TestPrismaLocatesAcrossLineEndings(t *testing.T) {
  schema := "model Sale {\n  id String @id\n}\n"
  unix := prismaLocationsOf(schema)
  windows := prismaLocationsOf(strings.ReplaceAll(schema, "\n", "\r\n"))
  if len(unix) != len(windows) {
    t.Fatalf("CRLF located %v, LF located %v", prismaLocationKeys(windows), prismaLocationKeys(unix))
  }
  for key, location := range unix {
    if windows[key] != location {
      t.Fatalf("%q located at %+v under CRLF, %+v under LF", key, windows[key], location)
    }
  }
}

/**
 * Verifies a set spanning files locates each model in the file that declares
 * it.
 *
 * A schema folder is one namespace built from several files, and the parser
 * returns no file for anything it parses. Attributing a model to the wrong file
 * of the set would send an author to open a file their model is not in, and
 * would do it on exactly the layout Prisma's multi-file schemas encourage.
 *
 *  1. Write one model per file into a two-file set.
 *  2. Locate across the set.
 *  3. Assert each name reports its own file.
 */
func TestPrismaLocatesAcrossAMultiFileSet(t *testing.T) {
  root := t.TempDir()
  write := func(relative string, content string) {
    absolute := filepath.Join(root, filepath.FromSlash(relative))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  write("prisma/sale.prisma", "model Sale {\n  id String @id\n}\n")
  write("prisma/seller.prisma", "model Seller {\n  id String @id\n}\n")
  locations, _ := locatePrismaDeclarations(root, []string{
    "prisma/sale.prisma",
    "prisma/seller.prisma",
  })
  if locations["Sale"].Path != "prisma/sale.prisma" || locations["Sale"].Line != 1 {
    t.Fatalf("Sale located at %+v", locations["Sale"])
  }
  if locations["Seller"].Path != "prisma/seller.prisma" || locations["Seller"].Line != 1 {
    t.Fatalf("Seller located at %+v", locations["Seller"])
  }
}

/**
 * Verifies an unlocatable name is simply absent rather than guessed at.
 *
 * The locator is subordinate to the parser: it may never invent a unit, and it
 * may never claim a position it did not find. Answering with a default line
 * would be indistinguishable from a real location at every call site, so the
 * absence is the contract — the caller is what decides the file-level fallback.
 *
 *  1. Scan a schema declaring one model.
 *  2. Assert a name it does not declare is missing from the result.
 */
func TestPrismaReportsNoLocationForAnUnknownName(t *testing.T) {
  locations := prismaLocationsOf("model Sale {\n  id String @id\n}\n")
  if _, invented := locations["Absent"]; invented {
    t.Fatal("the locator must not answer for a name it did not read")
  }
  if _, invented := locations["Sale.absent"]; invented {
    t.Fatal("the locator must not answer for a member it did not read")
  }
}
