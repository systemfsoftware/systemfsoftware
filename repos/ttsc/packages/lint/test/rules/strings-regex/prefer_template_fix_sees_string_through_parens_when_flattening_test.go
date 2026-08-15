package linthost

import "testing"

// TestFixPreferTemplateSeesStringThroughParensWhenFlattening verifies
// parentheses are transparent to the flattening DECISION:
// `("a" + b) + c + " s"` → “ `${("a" + b)}${c} s` “.
//
// The parenthesized operand itself stays one slot, but its string
// literal still marks the enclosing chain as string concatenation —
// `("a" + b)` evaluates to a string, so `+ c` appends and `c` can keep
// its own `${c}` slot. Were the containment gate opaque to parens it
// would demote the whole left side to `${("a" + b) + c}` — still
// value-correct, but a needless behavior regression from the pre-gate
// fixer and from upstream ESLint, which flattens here.
//
// 1. Snapshot a chain whose only string literal hides inside parens.
// 2. Apply `prefer-template` fix.
// 3. Assert `c` still flattens into its own slot.
func TestFixPreferTemplateSeesStringThroughParensWhenFlattening(t *testing.T) {
  assertFixSnapshot(
    t,
    "prefer-template",
    "const b: any = 1;\nconst c: any = 2;\nconst s = (\"a\" + b) + c + \" s\";\nJSON.stringify(s);\n",
    "const b: any = 1;\nconst c: any = 2;\nconst s = `${(\"a\" + b)}${c} s`;\nJSON.stringify(s);\n",
  )
}
