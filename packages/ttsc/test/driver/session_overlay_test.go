package driver_test

import (
  "path/filepath"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/ttsc/driver"
)

// TestDriverSessionAppliesIncrementalOverlayEdit verifies the resident Session
// feeds an in-memory overlay edit to the live program through an incremental
// UpdateProgram, reflecting the new content without a full reload.
//
// This is the resident-host foundation of samchon/ttsc#255: @ttsc/metro and
// @ttsc/unplugin must update one file's content (Metro's src) against a warm
// program rather than recompile the project. The edit keeps the file's
// signature and imports, so Apply must reuse the program and SourceText must
// show the new body.
//
// 1. Open a Session on a two-file project (a imports b).
// 2. Apply an overlay edit to b's body.
// 3. Assert Apply reused the program and SourceText shows the new body.
func TestDriverSessionAppliesIncrementalOverlayEdit(t *testing.T) {
  root := t.TempDir()
  writeProjectFile(t, root, "tsconfig.json", `{"compilerOptions":{"strict":true,"noEmit":true},"files":["a.ts","b.ts"]}`)
  writeProjectFile(t, root, "a.ts", "import { b } from \"./b\";\nexport const a: number = b();\n")
  writeProjectFile(t, root, "b.ts", "export function b(): number {\n  return 1;\n}\n")

  sess, diags, err := driver.NewSession(root, "tsconfig.json", driver.LoadProgramOptions{ForceNoEmit: true})
  if err != nil {
    t.Fatal(err)
  }
  if sess == nil {
    t.Fatalf("NewSession returned nil session (diagnostics: %v)", diags)
  }
  defer sess.Close()

  bAbs := filepath.Join(root, "b.ts")
  if text, ok := sess.SourceText(bAbs); !ok || !strings.Contains(text, "return 1") {
    t.Fatalf("initial source text mismatch: ok=%v text=%q", ok, text)
  }

  if reused := sess.Apply(bAbs, "export function b(): number {\n  return 2;\n}\n"); !reused {
    t.Fatalf("expected the overlay edit to reuse the program, got reused=false")
  }

  text, ok := sess.SourceText(bAbs)
  if !ok || !strings.Contains(text, "return 2") {
    t.Fatalf("session did not reflect the overlay edit: ok=%v text=%q", ok, text)
  }
}

// TestDriverSessionRebuildsWhenImportGraphChanges pins the false branch of
// Session.Apply's reused return value: an edit that changes the file's import
// graph cannot reuse the program and must rebuild, while SourceText still
// reflects the edit.
//
// Apply reuses the program only when the changed file's import/reference graph
// is unchanged (the structural-reuse contract of UpdateProgram). Adding an
// import is the canonical case that must fall back to a full rebuild, so this is
// the complement of TestDriverSessionAppliesIncrementalOverlayEdit.
//
// 1. Open a Session where b.ts imports nothing.
// 2. Apply an edit to b.ts that adds an import of c.ts.
// 3. Assert Apply reported reused=false and SourceText shows the new body.
func TestDriverSessionRebuildsWhenImportGraphChanges(t *testing.T) {
  root := t.TempDir()
  writeProjectFile(t, root, "tsconfig.json", `{"compilerOptions":{"strict":true,"noEmit":true},"files":["a.ts","b.ts","c.ts"]}`)
  writeProjectFile(t, root, "a.ts", "import { b } from \"./b\";\nexport const a: number = b();\n")
  writeProjectFile(t, root, "b.ts", "export function b(): number {\n  return 1;\n}\n")
  writeProjectFile(t, root, "c.ts", "export function c(): number {\n  return 5;\n}\n")

  sess, diags, err := driver.NewSession(root, "tsconfig.json", driver.LoadProgramOptions{ForceNoEmit: true})
  if err != nil {
    t.Fatal(err)
  }
  if sess == nil {
    t.Fatalf("NewSession returned nil session (diagnostics: %v)", diags)
  }
  defer sess.Close()

  bAbs := filepath.Join(root, "b.ts")
  // Adding an import to b.ts changes its import graph, so Apply must rebuild
  // rather than reuse the program.
  edited := "import { c } from \"./c\";\nexport function b(): number {\n  return c();\n}\n"
  if reused := sess.Apply(bAbs, edited); reused {
    t.Fatalf("expected an import-graph change to rebuild the program, got reused=true")
  }

  text, ok := sess.SourceText(bAbs)
  if !ok || !strings.Contains(text, "return c()") {
    t.Fatalf("session did not reflect the import-adding edit: ok=%v text=%q", ok, text)
  }
}
