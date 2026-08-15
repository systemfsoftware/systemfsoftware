package banner_test

import (
  "path/filepath"
  "testing"
)

// TestScriptConfigLoaderPrefersTextOverDefault verifies explicit banner object wins.
//
// JavaScript configs may carry helper fields alongside `text`. A bounded
// default-unwrapping loop is needed for transpiled module shapes, but once the
// current value is already a banner object it must not chase a nested `default`
// field and silently replace the user's explicit banner.
//
// 1. Export a CJS object with both `text` and `default.text`.
// 2. Load it through the script config loader.
// 3. Assert the top-level `text` is used.
func TestScriptConfigLoaderPrefersTextOverDefault(t *testing.T) {
  config := filepath.Join(t.TempDir(), "banner.config.cjs")
  writeFile(t, config, `module.exports = { text: "outer", default: { text: "inner" } };`)

  raw, err := bannerLoadBannerScriptConfigFile(config)
  if err != nil {
    t.Fatal(err)
  }
  object, ok := raw.(map[string]any)
  if !ok || object["text"] != "outer" {
    t.Fatalf("script config should prefer top-level text: %#v", raw)
  }
}
