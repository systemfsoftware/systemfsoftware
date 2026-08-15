package driver_test

import (
  "path/filepath"
  "strings"
  "testing"

  shimcompiler "github.com/microsoft/typescript-go/shim/compiler"

  "github.com/samchon/ttsc/packages/ttsc/driver"
)

// TestEmitAllWritesBuildInfoForAnIncrementalProject pins the build-information
// output of the driver's emit lanes.
//
// tsgo's CLI branches to performIncrementalCompilation whenever the resolved
// options are incremental, and that branch is what writes `.tsbuildinfo`. A
// host that builds its Program in-process never enters `internal/execute`, so
// the driver used to take the plain lane unconditionally and `incremental` /
// `tsBuildInfoFile` were accepted by the parser and then silently discarded —
// every plugin-carrying project emitted JavaScript and no build information at
// all (issue #1188). The path is checked at the exact location the options
// name, not merely "some .tsbuildinfo somewhere", and both whole-program lanes
// are checked because they reach the emitter through different callbacks.
func TestEmitAllWritesBuildInfoForAnIncrementalProject(t *testing.T) {
  root := t.TempDir()
  writeProjectFile(t, root, "tsconfig.json", `{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "incremental": true,
    "tsBuildInfoFile": "cache/app.tsbuildinfo"
  },
  "include": ["src"]
}
`)
  writeProjectFile(t, root, "src/index.ts", "export const value: number = 1;\n")

  // The build-info path the options name, resolved the way tsgo resolves it:
  // relative to the tsconfig's own directory.
  wantBuildInfo := filepath.ToSlash(filepath.Join(root, "cache", "app.tsbuildinfo"))

  for _, lane := range []struct {
    name string
    emit func(*driver.Program, shimcompiler.WriteFile) ([]driver.Diagnostic, error)
  }{
    {
      name: "EmitAll",
      emit: func(prog *driver.Program, wf shimcompiler.WriteFile) ([]driver.Diagnostic, error) {
        _, diags, err := prog.EmitAll(driver.NewRewriteSet(), wf)
        return diags, err
      },
    },
    {
      name: "EmitAllRaw",
      emit: func(prog *driver.Program, wf shimcompiler.WriteFile) ([]driver.Diagnostic, error) {
        _, diags, err := prog.EmitAllRaw(wf)
        return diags, err
      },
    },
  } {
    t.Run(lane.name, func(t *testing.T) {
      prog, configDiags, err := driver.LoadProgram(root, "tsconfig.json", driver.LoadProgramOptions{ForceEmit: true})
      if err != nil {
        t.Fatal(err)
      }
      if len(configDiags) != 0 {
        t.Fatalf("unexpected config diagnostics: %#v", configDiags)
      }
      defer prog.Close()

      written := map[string]string{}
      diags, err := lane.emit(prog, func(fileName, text string, _ *shimcompiler.WriteFileData) error {
        written[filepath.ToSlash(fileName)] = text
        return nil
      })
      if err != nil || len(diags) != 0 {
        t.Fatalf("emit mismatch: diags=%#v err=%v", diags, err)
      }

      buildInfo, ok := written[wantBuildInfo]
      if !ok {
        t.Fatalf("no build information written at %s; got %v", wantBuildInfo, sortedStringKeys(written))
      }
      // A `.tsbuildinfo` tsgo can read back is a JSON object carrying the
      // compiler version it was produced by; an empty or truncated write would
      // satisfy a bare existence check and fail every consumer.
      if !strings.HasPrefix(strings.TrimSpace(buildInfo), "{") || !strings.Contains(buildInfo, `"version"`) {
        t.Fatalf("build information is not a versioned JSON document:\n%s", buildInfo)
      }
      // The JavaScript this build exists for must still be emitted alongside it.
      if written[filepath.ToSlash(filepath.Join(root, "dist", "index.js"))] == "" {
        t.Fatalf("JavaScript output missing; got %v", sortedStringKeys(written))
      }
    })
  }
}
