package strip_test

import (
  "path/filepath"
  "testing"
)

// TestResolveConfigTsgoReturnsNothingWithoutAProjectTypeScript verifies an
// unresolvable project still hands the child no `--binary`.
//
// The negative twin of the project-anchored resolution. An empty result is the
// unchanged last resort: the child re-derives the compiler itself and its own
// `ttsc: typescript is required` names the missing package, which is a better
// diagnostic than a guessed path that does not exist.
//
//  1. Seed a project with no node_modules anywhere in its ancestry.
//  2. Shed both tool variables.
//  3. Assert the resolution invents nothing.
func TestResolveConfigTsgoReturnsNothingWithoutAProjectTypeScript(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := stripRealpathIfPossible(t.TempDir())
  requireNoAmbientInstall(t, root, "typescript")
  project := filepath.Join(root, "project")
  config := filepath.Join(project, "strip.config.ts")
  writeFile(t, config, "export default {};\n")

  if got := stripResolveConfigTsgo(stripConfigToolAnchors(config, project)); got != "" {
    t.Fatalf("stripResolveConfigTsgo = %q, want no compiler for a project with no typescript install", got)
  }
}
