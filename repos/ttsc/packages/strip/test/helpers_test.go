package strip_test

import (
  "encoding/json"
  "os"
  "os/exec"
  "path/filepath"
  "runtime"
  "strconv"
  "strings"
  "testing"
)

type transformResult struct {
  TypeScript map[string]string `json:"typescript"`
}

// packageRoot resolves the `packages/strip` module root from this external
// test package. Command tests execute `go run ./plugin` from that root.
func packageRoot(t *testing.T) string {
  t.Helper()
  _, file, _, ok := runtime.Caller(0)
  if !ok {
    t.Fatal("could not resolve helper path")
  }
  return filepath.Dir(filepath.Dir(file))
}

// runPlugin executes the strip sidecar exactly through its command entrypoint.
// TTSC_PLUGIN_COVERDIR optionally enables Go command coverage for subprocess
// branches that this external test package cannot otherwise count.
func runPlugin(t *testing.T, args ...string) (int, string, string) {
  t.Helper()
  goArgs := []string{"run"}
  if coverDir := os.Getenv("TTSC_PLUGIN_COVERDIR"); coverDir != "" {
    if err := os.MkdirAll(coverDir, 0o755); err != nil {
      t.Fatal(err)
    }
    goArgs = append(goArgs, "-cover", "-covermode=atomic", "-coverpkg=./plugin,./driver")
  }
  goArgs = append(goArgs, "./plugin")
  cmd := exec.Command("go", append(goArgs, args...)...)
  cmd.Dir = packageRoot(t)
  if coverDir := os.Getenv("TTSC_PLUGIN_COVERDIR"); coverDir != "" {
    cmd.Env = append(os.Environ(), "GOCOVERDIR="+coverDir)
  }
  out, err := cmd.Output()
  stderr := ""
  if exit, ok := err.(*exec.ExitError); ok {
    stderr = string(exit.Stderr)
    if status, ok := goRunExitStatus(stderr); ok {
      return status, string(out), stderr
    }
    return exit.ExitCode(), string(out), stderr
  }
  if err != nil {
    t.Fatalf("go run ./plugin failed before exit code: %v", err)
  }
  return 0, string(out), stderr
}

// goRunExitStatus extracts the sidecar exit code from the `go run` wrapper
// error text.
func goRunExitStatus(stderr string) (int, bool) {
  for _, line := range strings.Split(strings.TrimSpace(stderr), "\n") {
    line = strings.TrimSpace(line)
    if !strings.HasPrefix(line, "exit status ") {
      continue
    }
    value := strings.TrimPrefix(line, "exit status ")
    status, err := strconv.Atoi(value)
    if err != nil {
      return 0, false
    }
    return status, true
  }
  return 0, false
}

// seedProject writes a self-contained TypeScript fixture project under a fresh
// temporary directory.
func seedProject(t *testing.T, files map[string]string) string {
  t.Helper()
  root := t.TempDir()
  for name, text := range files {
    file := filepath.Join(root, filepath.FromSlash(name))
    if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  return root
}

// writeFile writes a fixture file, creating parent directories first.
func writeFile(t *testing.T, file string, contents string) {
  t.Helper()
  if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
    t.Fatal(err)
  }
  if err := os.WriteFile(file, []byte(contents), 0o644); err != nil {
    t.Fatal(err)
  }
}

// shedConfigToolEnvironment removes the compiler and launcher variables from
// the test's environment for the duration of one case.
//
// Neither runner for this package injects them: scripts/test-go-utility-plugins.cjs
// and scripts/test-go-coverage.cjs both forward the ambient environment
// wholesale. That is the point. `ttsx` exports TTSC_TSGO_BINARY and
// TTSC_TTSX_BINARY to every descendant, so a suite launched anywhere below one
// inherits both, and every existing loader case pins TTSC_TTSX_BINARY at a fake
// launcher of its own — between them, an evaluator that read the environment
// and nothing else looked correct. A case that means to exercise the
// project-anchored resolution has to shed them first, or it proves only that
// something upstream set them. (scripts/test-go-lint.cjs injects both outright,
// which is what kept the same defect invisible in @ttsc/lint.)
func shedConfigToolEnvironment(t *testing.T) {
  t.Helper()
  t.Setenv("TTSC_TSGO_BINARY", "")
  t.Setenv("TTSC_TTSX_BINARY", "")
}

// requireNoAmbientInstall skips the case when a real install of pkg answers
// above the fixture.
//
// The negative resolutions assert that a project answers with nothing, and the
// walk they exercise climbs to the filesystem root by design, exactly as Node's
// does. A stray install above the system temp directory would answer for the
// project the case deliberately left empty, and the failure would read as a
// defect in the resolution rather than as pollution outside the tree. The probe
// anchors one level above `root`, so it inspects the ambient ancestry only and
// never the fixture.
func requireNoAmbientInstall(t *testing.T, root, pkg string) {
  t.Helper()
  probe := filepath.Join(filepath.Dir(root), "ambient-probe-anchor")
  if found := stripNodePackageManifestFrom(probe, pkg); found != "" {
    t.Skipf("an ambient %s install at %s answers above the fixture", pkg, found)
  }
}

// seedProjectTypeScript materializes the `typescript` install a project-anchored
// compiler resolution walks to, under `root`'s node_modules, and returns the
// platform executable path it should produce.
//
// The layout mirrors an npm install: the `typescript` manifest, and the
// `@typescript/typescript-<platform>-<arch>` platform package beside it holding
// `lib/tsc` (`lib/tsc.exe` on Windows). The platform name comes from
// stripNodePlatformPair so the fixture tracks the host it runs on;
// TestNodePlatformPairMatchesTheNpmPlatformVocabulary pins that mapping
// independently, so a wrong mapping fails there rather than passing here.
func seedProjectTypeScript(t *testing.T, root string) string {
  t.Helper()
  binary := seedProjectTypeScriptWithoutCompiler(t, root)
  writeFile(t, binary, "")
  return binary
}

// seedProjectTypeScriptWithoutCompiler is seedProjectTypeScript stopping one
// file short: both manifests exist and the platform executable does not. It is
// the shape an install left behind by a failed or partial unpack, and the
// resolution must decline it rather than hand the child a path it cannot spawn.
func seedProjectTypeScriptWithoutCompiler(t *testing.T, root string) string {
  t.Helper()
  platform, arch := stripNodePlatformPair()
  modules := filepath.Join(root, "node_modules")
  writeFile(t, filepath.Join(modules, "typescript", "package.json"), `{"name":"typescript"}`)
  name := "tsc"
  if runtime.GOOS == "windows" {
    name = "tsc.exe"
  }
  binary := filepath.Join(
    modules,
    "@typescript",
    "typescript-"+platform+"-"+arch,
    "lib",
    name,
  )
  writeFile(t, filepath.Join(filepath.Dir(filepath.Dir(binary)), "package.json"), `{"name":"platform"}`)
  return binary
}

// seedProjectTtsc materializes the `ttsc` install a project-anchored launcher
// resolution walks to, under `root`'s node_modules, and returns the launcher
// path it should produce. Only the manifest and `lib/launcher/ttsx.js` matter;
// nothing spawns the file, so its contents are irrelevant.
func seedProjectTtsc(t *testing.T, root string) string {
  t.Helper()
  launcher := seedProjectTtscWithoutLauncher(t, root)
  writeFile(t, launcher, "")
  return launcher
}

// seedProjectTtscWithoutLauncher installs the `ttsc` manifest and no launcher
// file, the shape a resolution must decline rather than name a path that is not
// there.
func seedProjectTtscWithoutLauncher(t *testing.T, root string) string {
  t.Helper()
  installDir := filepath.Join(root, "node_modules", "ttsc")
  writeFile(t, filepath.Join(installDir, "package.json"), `{"name":"ttsc"}`)
  return filepath.Join(installDir, "lib", "launcher", "ttsx.js")
}

// mustJSON serializes the native plugin manifest shape expected by the sidecar.
func mustJSON(t *testing.T, value any) string {
  t.Helper()
  data, err := json.Marshal(value)
  if err != nil {
    t.Fatal(err)
  }
  return string(data)
}

// readFile loads emitted JavaScript output for build assertions.
func readFile(t *testing.T, file string) string {
  t.Helper()
  data, err := os.ReadFile(file)
  if err != nil {
    t.Fatal(err)
  }
  return string(data)
}

// stripManifest returns the plugin manifest sent through
// --plugins-json by ttsc's native plugin host.
func stripManifest(t *testing.T) string {
  t.Helper()
  return mustJSON(t, []map[string]any{{
    "name":  "@ttsc/strip",
    "stage": "transform",
    "config": map[string]any{
      "transform": "@ttsc/strip",
    },
  }})
}

// seedStripProject creates a reusable fixture with removable debugger and
// console.log statements. withOutDir selects build-ready output settings.
func seedStripProject(t *testing.T, withOutDir bool) string {
  t.Helper()
  compilerOptions := `{"target":"ES2022","module":"commonjs","strict":true}`
  if withOutDir {
    compilerOptions = `{"target":"ES2022","module":"commonjs","strict":true,"outDir":"dist","rootDir":"src"}`
  }
  return seedProject(t, map[string]string{
    "tsconfig.json": `{"compilerOptions":` + compilerOptions + `,"include":["src"]}`,
    "src/main.ts": strings.Join([]string{
      `debugger;`,
      `console.log("drop");`,
      `export const value = "ok";`,
      ``,
    }, "\n"),
  })
}
