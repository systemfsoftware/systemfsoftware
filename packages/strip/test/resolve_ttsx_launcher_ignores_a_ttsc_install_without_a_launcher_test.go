package strip_test

import (
  "path/filepath"
  "testing"
)

// TestResolveTtsxLauncherIgnoresATtscInstallWithoutALauncher verifies a `ttsc`
// package that carries no `lib/launcher/ttsx.js` falls through to the bare
// command.
//
// The launcher is derived from where the manifest resolved rather than
// requested as an exported subpath, so nothing but a stat proves the file is
// there. A source checkout of `ttsc` that has not been built has the manifest
// and no `lib`, and naming that path would spawn a file that does not exist
// instead of the `ttsx` a global install put on PATH.
//
//  1. Install a `ttsc` manifest with no built launcher beside it.
//  2. Shed both tool variables.
//  3. Assert the resolution declines it and keeps the bare command.
func TestResolveTtsxLauncherIgnoresATtscInstallWithoutALauncher(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := stripRealpathIfPossible(t.TempDir())
  missing := seedProjectTtscWithoutLauncher(t, root)
  config := filepath.Join(root, "strip.config.ts")
  writeFile(t, config, "export default {};\n")

  if got := stripResolveTtsxLauncher(stripConfigToolAnchors(config, root)); got != "ttsx" {
    t.Fatalf("stripResolveTtsxLauncher = %q, want the bare ttsx fallback when %q does not exist", got, missing)
  }
}
