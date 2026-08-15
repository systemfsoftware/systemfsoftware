package banner_test

import (
  "path/filepath"
  "testing"
)

// TestTtsxCommandSpawnsTheProjectLauncher verifies the anchors reach the
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
func TestTtsxCommandSpawnsTheProjectLauncher(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := bannerRealpathIfPossible(t.TempDir())
  launcher := seedProjectTtsc(t, root)
  config := filepath.Join(root, "banner.config.ts")
  writeFile(t, config, "export default { text: \"from ts\" };\n")

  cmd := bannerTtsxCommand(
    bannerConfigToolAnchors(config, root),
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
