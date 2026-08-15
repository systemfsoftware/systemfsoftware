package linthost

import "testing"

// TestUnicornPreferStringRawUnescapesOnlyTheDelimiterQuote verifies the value
// comparison unescapes the literal's OWN quote and no other.
//
// Upstream builds its unescape pattern from the literal's delimiter
// (`[\\${quote}]`), so `\"` cancels out in a double-quoted literal but stays
// an escape in a single-quoted one — where `String.raw` would emit the
// backslash and change the value. A port that unescaped both quote characters,
// or neither, would flip one of these two lines.
//
//  1. Double-quote a literal that escapes its own delimiter alongside `\\`.
//  2. Single-quote a literal escaping the OTHER quote alongside `\\`.
//  3. Assert only the double-quoted line, whose escapes all cancel, reports.
func TestUnicornPreferStringRawUnescapesOnlyTheDelimiterQuote(t *testing.T) {
  assertRuleCorpusCase(
    t,
    "unicorn/prefer-string-raw-delimiter-quote.ts",
    "// expect: unicorn/prefer-string-raw error\n"+
      "const own = \"a\\\"b\\\\c\";\n"+
      "const other = 'a\\\"b\\\\c';\n",
  )
}
