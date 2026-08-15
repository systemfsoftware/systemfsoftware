package strip_test

import (
  "path/filepath"
  "testing"
)

// TestResolveTtsxLauncherResolvesTheProjectLauncherWithoutTheEnvironment
// verifies @ttsc/strip's config evaluator spawns the `ttsc` the project
// installed.
//
// This branch fires one step before the compiler one and had no middle step at
// all: the variable, then a bare `ttsx` that only a global install puts on
// PATH. For the ordinary project-local install the spawn failed with a
// not-found error while the launcher sat in the project's own node_modules.
//
//  1. Seed a project holding `ttsc` and its `lib/launcher/ttsx.js`.
//  2. Shed TTSC_TSGO_BINARY and TTSC_TTSX_BINARY.
//  3. Assert the resolution names the project's launcher, not `ttsx`.
func TestResolveTtsxLauncherResolvesTheProjectLauncherWithoutTheEnvironment(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := stripRealpathIfPossible(t.TempDir())
  want := seedProjectTtsc(t, root)
  config := filepath.Join(root, "strip.config.ts")
  writeFile(t, config, "export default {};\n")

  if got := stripResolveTtsxLauncher(stripConfigToolAnchors(config, root)); got != want {
    t.Fatalf("stripResolveTtsxLauncher = %q, want the project launcher %q", got, want)
  }
}
