package driver_test

import (
  "reflect"
  "slices"
  "testing"

  shimcompiler "github.com/microsoft/typescript-go/shim/compiler"
)

// TestWriteFileDataFieldSetMatchesPinnedEmitter pins the field set of
// typescript-go's `compiler.WriteFileData` so a pin bump cannot quietly add a
// field the hand-assembled plugin emit forgets to populate.
//
// `EmitWithPluginTransformers` (driver/emit_plugin.go) builds by hand the
// `WriteFileData` that `internal/compiler/emitter.go::printSourceFile` builds
// before calling its writeFile. A struct literal is silent about what it omits:
// a field added upstream takes the Go zero value on the plugin lane while a
// plain build carries the emitter's value, which is exactly how the whole
// struct went missing for as long as it did — the lane passed a bare `nil`.
// Behavioural parity cannot catch a field nobody has thought to exercise yet,
// so the structural shape is pinned here instead: when this fails after a bump,
// re-read `printSourceFile` and decide, explicitly, what the new field carries
// on a lane that has no emitter behind it.
//
//  1. Reflect over the `WriteFileData` struct the shim re-exports.
//  2. Assert its field set is exactly the pinned one.
//  3. Assert every field the plugin lane reasons about is still one of them, so
//     a rename is reported as a rename rather than as an unrelated addition.
func TestWriteFileDataFieldSetMatchesPinnedEmitter(t *testing.T) {
  // The complete struct as of typescript-go
  // v0.0.0-20260429010842-56ab4af42157, sorted.
  pinned := []string{
    "BuildInfo",
    "Diagnostics",
    "SkippedDtsWrite",
    "SourceMapUrlPos",
  }
  // Every field the plugin lane has a decision recorded for, in
  // `writePluginEmitOutput`'s doc comment: `SourceMapUrlPos` is populated from
  // the printed file, and the other three are deliberately left zero because
  // this lane has no emitter diagnostics bag, no `.tsbuildinfo`, and nothing
  // that reads a callee-set flag back.
  decided := []string{
    "SourceMapUrlPos",
    "Diagnostics",
    "BuildInfo",
    "SkippedDtsWrite",
  }

  data := reflect.TypeOf(shimcompiler.WriteFileData{})
  actual := make([]string, 0, data.NumField())
  for i := 0; i < data.NumField(); i++ {
    actual = append(actual, data.Field(i).Name)
  }
  slices.Sort(actual)

  // Renames first, so a renamed field is reported as the rename it is rather
  // than as one arbitrary addition plus one arbitrary removal.
  for _, field := range decided {
    if !slices.Contains(actual, field) {
      t.Fatalf("compiler.WriteFileData no longer has %q, which the plugin emit lane reasons about; re-read internal/compiler/emitter.go::printSourceFile for its replacement", field)
    }
  }
  if !slices.Equal(actual, pinned) {
    t.Fatalf("compiler.WriteFileData changed shape.\npinned: %v\nactual: %v\nRe-read internal/compiler/emitter.go::printSourceFile, decide what the new field carries on the hand-assembled plugin lane, record it in writePluginEmitOutput's doc comment, then update this list.", pinned, actual)
  }
}
