package linthost

import "testing"

// TestUnicornNumberLiteralCaseSkipsCanonicalLiterals verifies every literal
// already spelled the upstream way stays silent.
//
// Widening the rule from "radix prefixes only" to "the whole literal" is what
// makes these negatives load-bearing: each one is a positive's twin exactly one
// property away (`1e10` vs `1E10`, `0xFF` vs `0xff`, `0xFF_FFn` vs `0xff_ffn`).
// A legacy octal (`0777`) and a bare `0` also guard the old `source[0] == '0'`
// gate, which the fix removed — neither carries a case-bearing letter, so
// neither may report.
//
//  1. Feed the rule a literal in its canonical spelling.
//  2. Assert the engine emits zero findings for it.
func TestUnicornNumberLiteralCaseSkipsCanonicalLiterals(t *testing.T) {
  for _, source := range []string{
    "const n = 123;\n",
    "const n = 0;\n",
    "const n = 1e10;\n",
    "const n = 2e+5;\n",
    "const n = 2e-5;\n",
    "const n = 0.5e3;\n",
    "const n = 1_000e5;\n",
    "const n = 0xFF;\n",
    "const n = 0b1010;\n",
    "const n = 0o17;\n",
    "const n = 0777;\n",
    "const n = 1n;\n",
    "const n = 0xFF_FFn;\n",
  } {
    assertRuleSkipsSource(t, unicornNumberLiteralCaseRuleName, source)
  }
}
