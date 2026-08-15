package linthost

import "testing"

// TestUnicornPreferStringRawSkipsLiteralsEndingWithABackslash verifies the
// rule stays silent when the value ends with a backslash.
//
// Pins upstream's `raw.at(-2) === "\\"` guard for string literals and its
// `cooked.at(-1) === "\\"` twin for templates. A raw template cannot end in a
// backslash — it would escape the closing backtick — so `String.raw` has no
// spelling for these values at all, yet the port reported them because their
// source contains `\\`. The all-backslashes literal is the boundary: every
// character is an escape and the last one still blocks the conversion.
//
//  1. Enable unicorn/prefer-string-raw on a fixture whose annotated line ends
//     in a path segment rather than a separator.
//  2. Add a trailing-separator path, an all-backslashes literal, and a
//     template whose cooked value ends with a backslash.
//  3. Assert the annotated line is the ONLY finding.
func TestUnicornPreferStringRawSkipsLiteralsEndingWithABackslash(t *testing.T) {
  assertRuleCorpusCase(
    t,
    "unicorn/prefer-string-raw-trailing-backslash.ts",
    "// expect: unicorn/prefer-string-raw error\n"+
      "const inner = \"C:\\\\Users\\\\me\";\n"+
      "const trailing = \"C:\\\\Users\\\\\";\n"+
      "const onlyBackslashes = \"\\\\\\\\\";\n"+
      "const template = `C:\\\\Users\\\\`;\n",
  )
}
