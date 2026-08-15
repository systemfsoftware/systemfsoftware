package banner_test

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

// packageRoot resolves the `packages/banner` module root from this external
// test package. Command tests run from that directory so `go run ./plugin`
// observes the same go.mod boundary as the native sidecar binary.
func packageRoot(t *testing.T) string {
  t.Helper()
  _, file, _, ok := runtime.Caller(0)
  if !ok {
    t.Fatal("could not resolve helper path")
  }
  return filepath.Dir(filepath.Dir(file))
}

// runPlugin executes the banner plugin through its real command entrypoint.
// When TTSC_PLUGIN_COVERDIR is set, the subprocess is instrumented with Go's
// command coverage so wrapper branches can be measured from this test package.
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

// goRunExitStatus recovers the wrapped program's status from `go run`, which
// reports non-zero program exits as a Go tool failure with `exit status N`.
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

// seedProject materializes a project-shaped fixture tree. The banner plugin is
// tested through real tsconfig projects rather than mocked compiler inputs.
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

// mustJSON serializes plugin manifests used by the sidecar command tests.
func mustJSON(t *testing.T, value any) string {
  t.Helper()
  data, err := json.Marshal(value)
  if err != nil {
    t.Fatal(err)
  }
  return string(data)
}

// readFile reads emitted project output and fails the test with the path still
// present in the stack when output is missing.
func readFile(t *testing.T, file string) string {
  t.Helper()
  data, err := os.ReadFile(file)
  if err != nil {
    t.Fatal(err)
  }
  return string(data)
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

// writeExecutable writes a launcher fixture with executable mode.
func writeExecutable(t *testing.T, file string, contents string) string {
  t.Helper()
  if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
    t.Fatal(err)
  }
  if err := os.WriteFile(file, []byte(contents), 0o755); err != nil {
    t.Fatal(err)
  }
  return file
}

// writeDirectLauncher writes a fake launcher that prints fixed bytes and
// exits. POSIX gets a `#!/bin/sh` script; Windows cannot spawn an
// extensionless shell script, so it gets the equivalent `.cmd` batch file and
// the returned path carries that extension. Both stay OFF the script-extension
// list, preserving the direct-exec (not node-routed) classification under
// test. Payloads must avoid cmd metacharacters (%, ^, &, |, <, >) — batch has
// no way to quote them that sh's single quotes would mirror.
func writeDirectLauncher(t *testing.T, file, stdout, stderr string, exitCode int) string {
  t.Helper()
  var b strings.Builder
  if runtime.GOOS == "windows" {
    b.WriteString("@echo off\r\n")
    if stdout != "" {
      b.WriteString("echo " + stdout + "\r\n")
    }
    if stderr != "" {
      // The redirect goes up front: a trailing `1>&2` would emit "x ", and
      // a bare `>&2` glued to a payload ending in a digit would turn that
      // digit into a file-descriptor redirect.
      b.WriteString("1>&2 echo " + stderr + "\r\n")
    }
    b.WriteString("exit /b " + strconv.Itoa(exitCode) + "\r\n")
    return writeExecutable(t, file+".cmd", b.String())
  }
  b.WriteString("#!/bin/sh\n")
  if stdout != "" {
    b.WriteString("printf '" + stdout + "'\n")
  }
  if stderr != "" {
    b.WriteString("printf '" + stderr + "' >&2\n")
  }
  if exitCode != 0 {
    b.WriteString("exit " + strconv.Itoa(exitCode) + "\n")
  }
  return writeExecutable(t, file, b.String())
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
  if found := bannerNodePackageManifestFrom(probe, pkg); found != "" {
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
// nodePlatformPair so the fixture tracks the host it runs on;
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
  platform, arch := bannerNodePlatformPair()
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

// bannerManifest builds the plugin manifest shape that ttsc passes to native
// plugins through --plugins-json. It writes a temporary banner.config.cjs file
// in dir exporting an object with a "text" string and returns a manifest that
// references it via "configFile".
func bannerManifest(t *testing.T, dir, text string) string {
  t.Helper()
  configFile := filepath.Join(dir, "banner.config.cjs")
  body := "module.exports = { text: " + mustJSON(t, text) + " };\n"
  if err := os.WriteFile(configFile, []byte(body), 0o644); err != nil {
    t.Fatal(err)
  }
  return mustJSON(t, []map[string]any{{
    "name":  "@ttsc/banner",
    "stage": "transform",
    "config": map[string]any{
      "transform":  "@ttsc/banner",
      "configFile": configFile,
    },
  }})
}

// bannerPrefix mirrors the JSDoc banner text expected from the shared utility
// transform host, keeping build assertions focused on the sidecar contract.
func bannerPrefix(text string) string {
  sep := strings.Repeat("-", 64)
  return "/**\n * " + sep + "\n * " + text + "\n *\n * @packageDocumentation\n */\n"
}
