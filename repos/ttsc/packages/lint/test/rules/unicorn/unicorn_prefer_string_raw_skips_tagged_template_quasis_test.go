package linthost

import "testing"

// TestUnicornPreferStringRawSkipsTaggedTemplateQuasis verifies the rule leaves
// the quasi of a tagged template alone.
//
// A tag function receives the RAW strings, so the escapes carry meaning and no
// `String.raw` prefix can be added — least of all to a template already tagged
// with `String.raw`, which the port used to flag against its own advice. The
// exemption is exactly the quasi: a literal sitting inside a substitution of a
// tagged template is ordinary code and must still report, so the predicate
// cannot degrade into "has a tagged template above it".
//
//  1. Tag two templates carrying `\\` escapes, one of them with `String.raw`.
//  2. Nest a template literal and a string literal inside the substitutions of
//     another tagged template, and annotate both.
//  3. Assert the tagged quasis report nothing while the two nested literals do.
func TestUnicornPreferStringRawSkipsTaggedTemplateQuasis(t *testing.T) {
  assertRuleSkipsSource(
    t,
    "unicorn/prefer-string-raw",
    "declare const dedent: (strings: TemplateStringsArray) => string;\n"+
      "const raw = String.raw`C:\\\\Users\\\\me`;\n"+
      "const trimmed = dedent`C:\\\\Users\\\\me`;\n",
  )
  assertRuleCorpusCase(
    t,
    "unicorn/prefer-string-raw-tagged-substitution.ts",
    "declare const tag: (strings: TemplateStringsArray, value: string) => string;\n"+
      "// expect: unicorn/prefer-string-raw error\n"+
      "const nestedTemplate = tag`${`C:\\\\Users\\\\me`}`;\n"+
      "// expect: unicorn/prefer-string-raw error\n"+
      "const nestedString = tag`${\"C:\\\\Users\\\\me\"}`;\n",
  )
}
