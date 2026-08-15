package linthost

import (
  "path/filepath"
  "testing"
)

// TestResolveConfigTsgoResolvesTheProjectCompilerWithoutTheEnvironment verifies
// the Go config evaluator finds its compiler in the project being linted.
//
// The evaluator used to read TTSC_TSGO_BINARY and nothing else, so it worked
// only by inheritance from a `ttsx`-launched host: the shipped `ttscserver`
// binary invoked with `--tsgo <path>` exports nothing, and evaluation aborted
// with `ttsc: typescript is required` before a line of the config was read.
// The case sheds both variables first, because scripts/test-go-lint.cjs exports
// them into `go test` and that is exactly what masked the defect.
//
//  1. Seed a project holding `typescript` and its platform package.
//  2. Shed TTSC_TSGO_BINARY and TTSC_TTSX_BINARY.
//  3. Assert the resolution names the project's own `lib/tsc`.
func TestResolveConfigTsgoResolvesTheProjectCompilerWithoutTheEnvironment(t *testing.T) {
  shedConfigToolEnvironment(t)
  root := realpathIfPossible(t.TempDir())
  want := seedProjectTypeScript(t, root)
  config := filepath.Join(root, "lint.config.ts")
  writeFile(t, config, "export default {};\n")

  if got := resolveConfigTsgo(configToolAnchors(config, root)); got != want {
    t.Fatalf("resolveConfigTsgo = %q, want the project compiler %q", got, want)
  }
}
