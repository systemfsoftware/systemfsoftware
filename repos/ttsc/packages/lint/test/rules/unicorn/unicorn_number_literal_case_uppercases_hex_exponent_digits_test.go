package linthost

import "testing"

// TestUnicornNumberLiteralCaseUppercasesHexExponentDigits verifies an `e` that
// sits inside a hex literal is treated as a hex digit — uppercased, never
// lowercased as if it were an exponent marker.
//
// This is the one place the two halves of the canonical spelling collide: the
// exponent letter of a decimal literal must go down (`1E10` -> `1e10`) while
// hex digits must go up, and `E` is both a letter and a hex digit. A fixer that
// lowercased every `e` would rewrite `0xFFE10` to `0xffe10`, undoing its own
// digit rule; hex literals have no exponent, so the digit rule always wins.
//
//  1. Fix hex literals whose `e` digit is lowercase and assert it comes back
//     uppercase alongside the other digits.
//  2. Re-run the rule on the already-uppercase `0xFFE10` and assert silence.
func TestUnicornNumberLiteralCaseUppercasesHexExponentDigits(t *testing.T) {
  for _, testCase := range []struct {
    source   string
    expected string
  }{
    {source: "const n = 0xffe10;\n", expected: "const n = 0xFFE10;\n"},
    {source: "const n = 0xFFe10;\n", expected: "const n = 0xFFE10;\n"},
    {source: "const n = 0Xe1;\n", expected: "const n = 0xE1;\n"},
  } {
    assertFixSnapshot(
      t,
      unicornNumberLiteralCaseRuleName,
      testCase.source,
      testCase.expected,
    )
  }
  assertRuleSkipsSource(
    t,
    unicornNumberLiteralCaseRuleName,
    "const n = 0xFFE10;\n",
  )
}
