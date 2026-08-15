package banner_test

import (
  "path/filepath"
  "testing"
)

// TestJSONAndScriptConfigPathsNeverSpawnTheLauncher verifies the non-TypeScript
// config shapes are untouched by the toolchain resolution.
//
// Only `banner.config.{ts,cts,mts}` spawns ttsx; `.json` is parsed in-process
// and `.js/.cjs/.mjs` run under Node alone. Both variables therefore point at
// paths that cannot be spawned: if the dispatcher ever routed either shape
// through the ttsx branch, or the resolution leaked into the Node branch, the
// load would fail instead of returning the config.
//
//  1. Pin both tool variables at paths that do not exist.
//  2. Load a `.json` and a `.cjs` config through the dispatcher.
//  3. Assert both return their text with no spawn failure.
func TestJSONAndScriptConfigPathsNeverSpawnTheLauncher(t *testing.T) {
  root := bannerRealpathIfPossible(t.TempDir())
  t.Setenv("TTSC_TSGO_BINARY", filepath.Join(root, "absent", "tsc"))
  t.Setenv("TTSC_TTSX_BINARY", filepath.Join(root, "absent", "ttsx.js"))

  jsonConfig := filepath.Join(root, "banner.config.json")
  writeFile(t, jsonConfig, `{"text":"from json"}`)
  raw, err := bannerLoadBannerConfigFile(jsonConfig, root)
  if err != nil {
    t.Fatalf("json config load failed with an unspawnable launcher pinned: %v", err)
  }
  object, ok := raw.(map[string]any)
  if !ok || object["text"] != "from json" {
    t.Fatalf("json config mismatch: %#v", raw)
  }

  scriptConfig := filepath.Join(root, "script", "banner.config.cjs")
  writeFile(t, scriptConfig, "module.exports = { text: \"from cjs\" };\n")
  raw, err = bannerLoadBannerConfigFile(scriptConfig, root)
  if err != nil {
    t.Fatalf("cjs config load failed with an unspawnable launcher pinned: %v", err)
  }
  object, ok = raw.(map[string]any)
  if !ok || object["text"] != "from cjs" {
    t.Fatalf("cjs config mismatch: %#v", raw)
  }
}
