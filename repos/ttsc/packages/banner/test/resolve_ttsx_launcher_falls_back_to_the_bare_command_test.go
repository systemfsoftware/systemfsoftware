package banner_test

import (
  "path/filepath"
  "testing"
)

// TestResolveTtsxLauncherFallsBackToTheBareCommand verifies an unresolvable
// project still produces the bare `ttsx` name.
//
// The negative twin of the project-anchored launcher resolution, and the
// guarantee that the fix adds a middle step rather than replacing the old last
// resort. A global `ttsc` install puts `ttsx` on PATH with nothing in any
// project's node_modules, so inventing a path here would break the one shape
// that worked before.
//
//  1. Seed a project with no `ttsc` install in its ancestry.
//  2. Shed both tool variables.
//  3. Assert the bare command name survives.
func TestResolveTtsxLauncherFallsBackToTheBareCommand(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := bannerRealpathIfPossible(t.TempDir())
  requireNoAmbientInstall(t, root, "ttsc")
  project := filepath.Join(root, "project")
  config := filepath.Join(project, "banner.config.ts")
  writeFile(t, config, "export default { text: \"from ts\" };\n")

  if got := bannerResolveTtsxLauncher(bannerConfigToolAnchors(config, project)); got != "ttsx" {
    t.Fatalf("resolveTtsxLauncher = %q, want the bare ttsx fallback", got)
  }
}
