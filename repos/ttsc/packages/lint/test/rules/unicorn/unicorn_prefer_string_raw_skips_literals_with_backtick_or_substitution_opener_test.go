package linthost

import "testing"

// TestUnicornPreferStringRawSkipsLiteralsWithBacktickOrSubstitutionOpener
// verifies the rule stays silent when the value cannot live inside a template.
//
// Pins upstream's `raw.includes("`") || raw.includes("${")` guard. Wrapped in
// backticks, a literal backtick would close the template early and `${` would
// start a substitution, so the advised conversion produces different code — or
// no code at all. A lone `$` is harmless and must still report, which is why
// the guard keys on the two-character opener rather than the dollar sign. A
// template already spells both as escapes, so upstream leaves them to its
// value comparison rather than a second explicit guard — and so does the port,
// which is why the same two characters must be exercised through templates.
//
//  1. Enable unicorn/prefer-string-raw on a fixture whose annotated line holds
//     a dollar sign that opens nothing.
//  2. Add string literals carrying a backtick and a `${` substitution opener,
//     then the templates that escape those same two characters.
//  3. Assert the annotated line is the ONLY finding.
func TestUnicornPreferStringRawSkipsLiteralsWithBacktickOrSubstitutionOpener(t *testing.T) {
  assertRuleCorpusCase(
    t,
    "unicorn/prefer-string-raw-template-delimiters.ts",
    "// expect: unicorn/prefer-string-raw error\n"+
      "const dollar = \"a\\\\b$c\";\n"+
      "const backtick = \"a\\\\b`c\";\n"+
      "const opener = \"a\\\\b${c}\";\n"+
      "const templateBacktick = `a\\\\b\\`c`;\n"+
      "const templateOpener = `a\\\\b\\${c}`;\n",
  )
}
