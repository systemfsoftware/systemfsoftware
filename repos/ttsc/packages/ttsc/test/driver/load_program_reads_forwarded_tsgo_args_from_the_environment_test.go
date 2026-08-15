package driver_test

import (
  "encoding/json"
  "strings"
  "testing"

  "github.com/samchon/ttsc/packages/ttsc/driver"
)

// TestLoadProgramReadsForwardedTsgoArgsFromTheEnvironment pins the delivery
// channel for the tsgo flags the `ttsc` launcher forwards to a native sidecar.
//
// The payload used to travel only as a `--tsgo-args` CLI flag, which #113 added
// to a plugin protocol third-party hosts had already frozen: a host parsing
// with `flag.ContinueOnError` and no such flag exits 2 before its build starts
// (issue #1188). The launcher now publishes it in `driver.TsgoArgsEnv`, and a
// host that never declared the flag — typia's `ttsc-typia` is exactly this
// shape — picks the options up simply by calling LoadProgram.
//
// The four cases below are the whole decision table, because each wrong answer
// is invisible without its twin: the env value must apply, an explicit argv
// must win over it, an absent variable must change nothing, and a malformed
// value must be an error rather than a silent no-op.
//
//  1. Build a project whose tsconfig leaves `strict` off and whose source only
//     type-checks that way.
//  2. Load it with the environment carrying `--strict`, with an explicit
//     conflicting argv, with nothing set, and with an unparsable value.
//  3. Assert the resolved options and diagnostics for each.
func TestLoadProgramReadsForwardedTsgoArgsFromTheEnvironment(t *testing.T) {
  root := t.TempDir()
  writeProjectFile(t, root, "tsconfig.json", `{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "rootDir": "src",
    "outDir": "dist",
    "strict": false
  },
  "include": ["src"]
}
`)
  // Only a non-strict program accepts this: under `strictNullChecks` the
  // parameter is possibly null.
  writeProjectFile(t, root, "src/index.ts", "export const len = (x: string | null): number => x.length;\n")

  loadStrictness := func(t *testing.T, options driver.LoadProgramOptions) (bool, []driver.Diagnostic) {
    t.Helper()
    prog, diags, err := driver.LoadProgram(root, "tsconfig.json", options)
    if err != nil {
      t.Fatal(err)
    }
    if len(diags) != 0 {
      return false, diags
    }
    defer prog.Close()
    return prog.ParsedConfig.ParsedConfig.CompilerOptions.Strict.IsTrue(), prog.Diagnostics()
  }

  encoded := func(args ...string) string {
    payload, err := json.Marshal(args)
    if err != nil {
      t.Fatal(err)
    }
    return string(payload)
  }

  t.Run("environment value applies", func(t *testing.T) {
    t.Setenv(driver.TsgoArgsEnv, encoded("--strict"))
    strict, diags := loadStrictness(t, driver.LoadProgramOptions{})
    if !strict {
      t.Fatal("forwarded --strict from the environment did not reach CompilerOptions")
    }
    if len(diags) == 0 {
      t.Fatal("expected the strict-null diagnostic the forwarded flag turns on")
    }
  })

  t.Run("explicit argv wins over the environment", func(t *testing.T) {
    // An embedder that decided the argv itself keeps deciding, so a variable an
    // ancestor ttsc process left behind cannot override a deliberate choice.
    t.Setenv(driver.TsgoArgsEnv, encoded("--strict"))
    strict, diags := loadStrictness(t, driver.LoadProgramOptions{TsgoArgs: []string{"--noImplicitAny"}})
    if strict {
      t.Fatal("environment overrode an explicit TsgoArgs value")
    }
    if len(diags) != 0 {
      t.Fatalf("unexpected diagnostics under the explicit argv: %#v", diags)
    }
  })

  t.Run("absent variable forwards nothing", func(t *testing.T) {
    t.Setenv(driver.TsgoArgsEnv, "")
    strict, diags := loadStrictness(t, driver.LoadProgramOptions{})
    if strict {
      t.Fatal("strict turned on with nothing forwarded")
    }
    if len(diags) != 0 {
      t.Fatalf("unexpected diagnostics with nothing forwarded: %#v", diags)
    }
  })

  t.Run("malformed value is reported", func(t *testing.T) {
    t.Setenv(driver.TsgoArgsEnv, "{not json")
    _, _, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{})
    if err == nil {
      t.Fatal("a malformed payload was accepted silently")
    }
    if !strings.Contains(err.Error(), driver.TsgoArgsEnv) {
      t.Fatalf("error does not name the offending channel: %v", err)
    }
  })
}
