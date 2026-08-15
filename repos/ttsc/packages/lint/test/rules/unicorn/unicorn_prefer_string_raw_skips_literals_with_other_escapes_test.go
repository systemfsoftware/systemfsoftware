package linthost

import "testing"

// TestUnicornPreferStringRawSkipsLiteralsWithOtherEscapes verifies the rule
// stays silent when a literal carries an escape other than `\\`.
//
// Pins upstream's `unescapeBackslash(raw) !== node.value` guard. `String.raw`
// emits every escape by its source spelling, so converting `"\\d\t"` would
// turn the TAB into the two characters `\t` — a silent value change. The port
// used to report any literal whose raw source contained `\\`, which advised
// exactly that corruption (issue #575). The escaped backslash on its own
// (`"\\n"` — a backslash followed by the letter `n`) must still report, so the
// guard cannot be implemented as "raw contains a second backslash".
//
//  1. Enable unicorn/prefer-string-raw on a fixture whose only annotated line
//     is a literal escaping nothing but backslashes.
//  2. Add string and template literals that mix `\\` with a tab, a hex, and a
//     newline escape.
//  3. Assert the annotated line is the ONLY finding.
func TestUnicornPreferStringRawSkipsLiteralsWithOtherEscapes(t *testing.T) {
  assertRuleCorpusCase(
    t,
    "unicorn/prefer-string-raw-other-escapes.ts",
    "// expect: unicorn/prefer-string-raw error\n"+
      "const backslashOnly = \"\\\\n\";\n"+
      "const tab = \"\\\\d\\t\";\n"+
      "const hex = \"\\\\d\\x41\";\n"+
      "const newline = \"\\\\d\\n\";\n"+
      "const template = `\\\\d\\t`;\n",
  )
}
