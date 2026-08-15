package linthost

import "testing"

// TestFixPreferTemplateIgnoresStringUnderOtherOperator verifies a
// string literal under a NON-`+` operator does not mark its chain
// string-like: `a * "x" + c + " s"` → “ `${a * "x" + c} s` “.
//
// `a * "x"` coerces the string to a number, so `(a * "x") + c` may be
// numeric addition and must stay one `${…}` slot. The containment gate
// only recurses through `+` (and parentheses); treating any descendant
// string literal as evidence would reintroduce the value corruption
// the gate exists to prevent, just one operator deeper.
//
// 1. Snapshot a chain whose only inner string sits under `*`.
// 2. Apply `prefer-template` fix.
// 3. Assert the non-string sub-chain stays a single slot.
func TestFixPreferTemplateIgnoresStringUnderOtherOperator(t *testing.T) {
  assertFixSnapshot(
    t,
    "prefer-template",
    "const a: any = 1;\nconst c: any = 2;\nconst s = a * \"x\" + c + \" s\";\nJSON.stringify(s);\n",
    "const a: any = 1;\nconst c: any = 2;\nconst s = `${a * \"x\" + c} s`;\nJSON.stringify(s);\n",
  )
}
