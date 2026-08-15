package ttsc_test

import (
  "encoding/json"
  "path/filepath"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/ttsc/driver"
  "github.com/samchon/ttsc/packages/ttsc/utility"
)

type scopedHostInputPlugin struct {
  hash  bool
  input string
}

func (plugin scopedHostInputPlugin) SourcePreamble(ctx driver.PluginContext) (string, error) {
  if plugin.hash {
    ctx.ReportHostInputHash(plugin.input, stringPointer(strings.Repeat("a", 64)))
    ctx.ReportHostInputRealpath(
      plugin.input,
      stringPointer(filepath.Join(filepath.Dir(plugin.input), "physical")),
    )
  } else {
    ctx.ReportHostInput(plugin.input)
  }
  return "", nil
}

// TestUtilityTransformOmitsCrossPluginHostInputHash verifies one plugin's
// fingerprint and physical identity cannot prove another plugin's unproven
// dependency.
//
// The transform envelope describes the combined result of every linked hook.
// If any hook lists a path without an exact observation, persistent adapters
// must see the path but no proof, even when another hook hashes the same file.
func TestUtilityTransformOmitsCrossPluginHostInputHash(t *testing.T) {
  resetLinkedPluginRegistry()
  root := t.TempDir()
  input := filepath.Join(root, "shared.config.cjs")
  driver.RegisterPlugin(scopedHostInputPlugin{input: input})
  driver.RegisterPlugin(scopedHostInputPlugin{hash: true, input: input})
  writeProjectFile(t, root, "tsconfig.json", `{
  "compilerOptions": { "module": "commonjs", "target": "es2020" },
  "files": ["index.ts"]
}
`)
  writeProjectFile(t, root, "index.ts", "export const value = 1;\n")

  code, out, errOut := captureUtilityOutput(t, func() int {
    return utility.RunTransform([]string{
      "--cwd", root,
      "--plugins-json", `[{"name":"unproven","stage":"transform","config":{}},{"name":"proven","stage":"transform","config":{}}]`,
    })
  })
  if code != 0 || errOut != "" {
    t.Fatalf("RunTransform mismatch: code=%d stdout=%q stderr=%q", code, out, errOut)
  }
  var result utilityTransformResult
  if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &result); err != nil {
    t.Fatal(err)
  }
  if len(result.HostInputs) != 1 || result.HostInputs[0] != input {
    t.Fatalf("host inputs mismatch: %#v", result.HostInputs)
  }
  if _, ok := result.HostInputHashes[input]; ok {
    t.Fatalf("another plugin's hash must not revive missing proof: %#v", result.HostInputHashes)
  }
  if _, ok := result.HostInputRealpaths[input]; ok {
    t.Fatalf("another plugin's realpath must not revive missing proof: %#v", result.HostInputRealpaths)
  }
}
