package strip_test

import (
  "path/filepath"
  "testing"
)

// TestResolveTtsxLauncherKeepsAnExplicitlyPinnedBinary verifies an explicit
// TTSC_TTSX_BINARY still wins over the project's own install.
//
// The launcher twin of the compiler's pinning guarantee, and the reason a
// plugin spawned by ttsc keeps using the launcher that spawned it: the host
// exports the variable into every plugin process, and that launcher must
// outrank whatever `ttsc` the compiled project happens to install.
//
//  1. Seed a project holding a resolvable `ttsc` install.
//  2. Point TTSC_TTSX_BINARY at a different path.
//  3. Assert the pinned path is returned verbatim.
func TestResolveTtsxLauncherKeepsAnExplicitlyPinnedBinary(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := stripRealpathIfPossible(t.TempDir())
  project := seedProjectTtsc(t, root)
  config := filepath.Join(root, "strip.config.ts")
  writeFile(t, config, "export default {};\n")

  pinned := filepath.Join(root, "pinned", "ttsx.js")
  t.Setenv("TTSC_TTSX_BINARY", pinned)

  got := stripResolveTtsxLauncher(stripConfigToolAnchors(config, root))
  if got == project {
    t.Fatalf("stripResolveTtsxLauncher took the project launcher %q over the pinned %q", project, pinned)
  }
  if got != pinned {
    t.Fatalf("stripResolveTtsxLauncher = %q, want the pinned %q", got, pinned)
  }
}
