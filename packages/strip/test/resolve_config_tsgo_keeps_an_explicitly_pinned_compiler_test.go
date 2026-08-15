package strip_test

import (
  "path/filepath"
  "testing"
)

// TestResolveConfigTsgoKeepsAnExplicitlyPinnedCompiler verifies an explicit
// TTSC_TSGO_BINARY still wins over the project's own install.
//
// Anchoring the resolution on the project is a fallback, not a replacement: an
// embedder that pins a compiler (a cross-version harness, a benchmark cell)
// must keep pinning it, and so must the ttsc host that exports the variable
// into every plugin process it spawns. The project here can answer, so the
// assertion pins the precedence rather than the absence of an alternative.
//
//  1. Seed a project holding a resolvable `typescript` install.
//  2. Point TTSC_TSGO_BINARY at a different path.
//  3. Assert the pinned path is returned verbatim.
func TestResolveConfigTsgoKeepsAnExplicitlyPinnedCompiler(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := stripRealpathIfPossible(t.TempDir())
  project := seedProjectTypeScript(t, root)
  config := filepath.Join(root, "strip.config.ts")
  writeFile(t, config, "export default {};\n")

  pinned := filepath.Join(root, "pinned", "tsc")
  t.Setenv("TTSC_TSGO_BINARY", pinned)

  got := stripResolveConfigTsgo(stripConfigToolAnchors(config, root))
  if got == project {
    t.Fatalf("stripResolveConfigTsgo took the project compiler %q over the pinned %q", project, pinned)
  }
  if got != pinned {
    t.Fatalf("stripResolveConfigTsgo = %q, want the pinned %q", got, pinned)
  }
}
