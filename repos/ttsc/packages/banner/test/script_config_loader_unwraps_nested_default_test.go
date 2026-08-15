package banner_test

import (
  "path/filepath"
  "testing"
)

// TestScriptConfigLoaderUnwrapsNestedDefault verifies transpiled CJS defaults.
//
// Some transpilers produce nested default objects for ESM-style config exports.
// The JavaScript loader accepts that shape with a bounded unwrap so banner
// configs authored as default exports survive CJS interop wrappers.
//
// 1. Export a CJS object whose banner lives under `default.text`.
// 2. Load it through the script config loader.
// 3. Assert the nested banner text is returned.
func TestScriptConfigLoaderUnwrapsNestedDefault(t *testing.T) {
  config := filepath.Join(t.TempDir(), "banner.config.cjs")
  writeFile(t, config, `module.exports = { default: { text: "nested default" } };`)

  raw, err := bannerLoadBannerScriptConfigFile(config)
  if err != nil {
    t.Fatal(err)
  }
  object, ok := raw.(map[string]any)
  if !ok || object["text"] != "nested default" {
    t.Fatalf("nested default cjs config mismatch: %#v", raw)
  }
}
