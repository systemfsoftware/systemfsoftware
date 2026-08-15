package linthost

import (
  "os"
  "path/filepath"
  "runtime"
  "testing"
)

// TestResolveConfigTsgoResolvesThroughALinkedTypeScriptInstall verifies the
// platform package is found beside the install's REAL directory.
//
// pnpm (this repository's own package manager) puts the real `typescript`
// directory in its content-addressed store and leaves a link in the project's
// node_modules. The platform package is a sibling of the store copy, not of the
// link, so a second hop that walked upward from the link path would climb past
// it and resolve nothing. Node resolves a module's dependencies from its real
// location, and this pins that the Go host does the same.
//
//  1. Build a store directory holding `typescript` and its platform package.
//  2. Link the project's `node_modules/typescript` at that store directory.
//  3. Assert the resolution reaches the store's `lib/tsc`.
func TestResolveConfigTsgoResolvesThroughALinkedTypeScriptInstall(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := realpathIfPossible(t.TempDir())
  store := filepath.Join(root, ".store", "typescript@5", "node_modules")
  want := seedProjectTypeScript(t, filepath.Dir(store))

  link := filepath.Join(root, "node_modules", "typescript")
  if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
    t.Fatalf("MkdirAll: %v", err)
  }
  target := filepath.Join(store, "typescript")
  if err := os.Symlink(target, link); err != nil {
    if runtime.GOOS != "windows" || createWindowsJunction(link, target) != nil {
      t.Skipf("directory link unavailable: %v", err)
    }
  }

  config := filepath.Join(root, "lint.config.ts")
  writeFile(t, config, "export default {};\n")

  if got := resolveConfigTsgo(configToolAnchors(config, root)); got != want {
    t.Fatalf("resolveConfigTsgo = %q, want the linked install's compiler %q", got, want)
  }
}
