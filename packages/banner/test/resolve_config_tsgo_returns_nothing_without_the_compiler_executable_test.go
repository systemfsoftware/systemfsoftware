package banner_test

import (
  "path/filepath"
  "testing"
)

// TestResolveConfigTsgoReturnsNothingWithoutTheCompilerExecutable verifies a
// platform package that carries no `lib/tsc` resolves to nothing.
//
// One step past the missing-platform-package boundary, and the reason the last
// hop stats the file instead of trusting the layout: a partially unpacked or
// hand-pruned platform package has its manifest and no executable. Naming the
// path anyway would turn a reinstall diagnostic into an exec failure inside the
// child, which reads as a ttsc bug rather than a broken install.
//
//  1. Seed both manifests and stop before writing the executable.
//  2. Shed both tool variables.
//  3. Assert the resolution declines the incomplete install.
func TestResolveConfigTsgoReturnsNothingWithoutTheCompilerExecutable(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := bannerRealpathIfPossible(t.TempDir())
  missing := seedProjectTypeScriptWithoutCompiler(t, root)
  config := filepath.Join(root, "banner.config.ts")
  writeFile(t, config, "export default { text: \"from ts\" };\n")

  if got := bannerResolveConfigTsgo(bannerConfigToolAnchors(config, root)); got != "" {
    t.Fatalf("resolveConfigTsgo = %q, want no compiler when %q does not exist", got, missing)
  }
}
