package banner_test

import (
  "path/filepath"
  "testing"
)

// TestScriptConfigLoaderPrefersDefaultExportOverNamedText verifies ESM default precedence.
//
// Banner configs commonly use `export default { text }`. A named `text` export
// may exist as a helper constant in the same module, but it must not override
// the default config object. This preserves the loader precedence from before
// nested CJS default unwrapping was added.
//
// 1. Export a named `text` helper and a default banner object.
// 2. Load it through the script config loader.
// 3. Assert the default export wins.
func TestScriptConfigLoaderPrefersDefaultExportOverNamedText(t *testing.T) {
  config := filepath.Join(t.TempDir(), "banner.config.mjs")
  writeFile(t, config, `export const text = "named"; export default { text: "default" };`)

  raw, err := bannerLoadBannerScriptConfigFile(config)
  if err != nil {
    t.Fatal(err)
  }
  object, ok := raw.(map[string]any)
  if !ok || object["text"] != "default" {
    t.Fatalf("script config should prefer default export: %#v", raw)
  }
}
