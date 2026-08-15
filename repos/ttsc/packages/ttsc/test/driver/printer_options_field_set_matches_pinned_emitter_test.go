package driver_test

import (
  "reflect"
  "slices"
  "testing"

  shimprinter "github.com/microsoft/typescript-go/shim/printer"
)

// TestPrinterOptionsFieldSetMatchesPinnedEmitter pins the field set of
// typescript-go's `printer.PrinterOptions` so a pin bump cannot quietly add an
// option the hand-assembled plugin emit forgets to forward.
//
// `PrintFileWithSourceMap` (shim/compiler/emit_sourcemap.go) rebuilds by hand
// the `PrinterOptions` that `internal/compiler/emitter.go::emitJSFile` builds.
// A struct literal is silent about what it omits: a field added upstream takes
// the Go zero value on the plugin lane while a plain build honors it, which is
// exactly how `removeComments`, `noEmitHelpers`, and `target` were dropped for
// as long as they were. Behavioural parity cannot catch a field nobody has
// thought to exercise yet, so the structural shape is pinned here instead: when
// this fails after a bump, re-read `emitJSFile` and forward whatever it now
// sets.
//
//  1. Reflect over the `PrinterOptions` struct the shim re-exports.
//  2. Assert its field set is exactly the pinned one.
//  3. Assert every field `emitJSFile` forwards is still one of them, so a
//     rename is reported as a rename rather than as an unrelated addition.
func TestPrinterOptionsFieldSetMatchesPinnedEmitter(t *testing.T) {
  // The complete struct as of typescript-go
  // v0.0.0-20260429010842-56ab4af42157, sorted.
  pinned := []string{
    "InlineSourceMap",
    "InlineSources",
    "NeverAsciiEscape",
    "NewLine",
    "NoEmitHelpers",
    "OmitBraceSourceMapPositions",
    "OnlyPrintJSDocStyle",
    "PreserveSourceNewlines",
    "RemoveComments",
    "SourceMap",
    "Target",
    "TerminateUnterminatedLiterals",
  }
  // The subset `emitJSFile` assigns from CompilerOptions, and therefore the
  // subset `PrintFileWithSourceMap` must assign too. The remaining fields are
  // left zero by the pinned emitter as well, so the plugin lane leaves them
  // zero on purpose.
  forwarded := []string{
    "RemoveComments",
    "NewLine",
    "NoEmitHelpers",
    "SourceMap",
    "InlineSourceMap",
    "InlineSources",
    "Target",
  }

  options := reflect.TypeOf(shimprinter.PrinterOptions{})
  actual := make([]string, 0, options.NumField())
  for i := 0; i < options.NumField(); i++ {
    actual = append(actual, options.Field(i).Name)
  }
  slices.Sort(actual)

  // Renames first, so a renamed field is reported as the rename it is rather
  // than as one arbitrary addition plus one arbitrary removal.
  for _, field := range forwarded {
    if !slices.Contains(actual, field) {
      t.Fatalf("printer.PrinterOptions no longer has %q, which PrintFileWithSourceMap forwards; re-read internal/compiler/emitter.go::emitJSFile for its replacement", field)
    }
  }
  if !slices.Equal(actual, pinned) {
    t.Fatalf("printer.PrinterOptions changed shape.\npinned: %v\nactual: %v\nRe-read internal/compiler/emitter.go::emitJSFile and forward every field it sets from PrintFileWithSourceMap, then update this list.", pinned, actual)
  }
}
