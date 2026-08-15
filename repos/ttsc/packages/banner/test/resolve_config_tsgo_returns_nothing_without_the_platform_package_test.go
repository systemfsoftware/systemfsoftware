package banner_test

import (
  "path/filepath"
  "testing"
)

// TestResolveConfigTsgoReturnsNothingWithoutThePlatformPackage verifies a
// `typescript` install whose platform dependency is missing resolves to nothing.
//
// The boundary between the two resolution hops. `typescript` carries the native
// compiler in an optional per-platform package, so an install made with
// optional dependencies disabled has the manifest and no platform package.
// Returning a path anyway would hand the child a `--binary` that cannot be
// spawned, and replace a clear "reinstall typescript" diagnostic with an exec
// failure.
//
//  1. Seed a project holding only the `typescript` manifest.
//  2. Shed both tool variables.
//  3. Assert the resolution invents no executable path.
func TestResolveConfigTsgoReturnsNothingWithoutThePlatformPackage(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := bannerRealpathIfPossible(t.TempDir())
  platform, arch := bannerNodePlatformPair()
  requireNoAmbientInstall(t, root, "@typescript/typescript-"+platform+"-"+arch)
  writeFile(
    t,
    filepath.Join(root, "node_modules", "typescript", "package.json"),
    `{"name":"typescript"}`,
  )
  config := filepath.Join(root, "banner.config.ts")
  writeFile(t, config, "export default { text: \"from ts\" };\n")

  if got := bannerResolveConfigTsgo(bannerConfigToolAnchors(config, root)); got != "" {
    t.Fatalf("resolveConfigTsgo = %q, want no compiler when the platform package is absent", got)
  }
}
