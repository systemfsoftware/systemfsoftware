package linthost

import (
  "context"
  "path/filepath"
  "testing"
)

// TestTtsxCommandContextSpawnsTheProjectLauncher verifies the anchors reach the
// spawned command, not just the resolver.
//
// resolveTtsxLauncher can be right while the command still spawns a bare
// `ttsx`, because the launcher is chosen inside ttsxCommandContext rather than
// passed to it. This pins the wiring: a resolved `.js` launcher also has to be
// handed to node, which shouldRunTtsxThroughNode decides from the extension.
//
//  1. Seed a project holding `ttsc` and its launcher, and shed both variables.
//  2. Build the command the TypeScript config loader would build.
//  3. Assert node receives the project's launcher followed by the arguments.
func TestTtsxCommandContextSpawnsTheProjectLauncher(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := realpathIfPossible(t.TempDir())
  launcher := seedProjectTtsc(t, root)
  config := filepath.Join(root, "lint.config.ts")
  writeFile(t, config, "export default {};\n")

  cmd := ttsxCommandContext(
    context.Background(),
    configToolAnchors(config, root),
    "--no-plugins",
    "loader.mts",
  )
  want := []string{launcher, "--no-plugins", "loader.mts"}
  if len(cmd.Args) != len(want)+1 {
    t.Fatalf("command args = %v, want the node binary followed by %v", cmd.Args, want)
  }
  for i, argument := range want {
    if cmd.Args[i+1] != argument {
      t.Fatalf("command arg %d = %q, want %q (full: %v)", i+1, cmd.Args[i+1], argument, cmd.Args)
    }
  }
}
