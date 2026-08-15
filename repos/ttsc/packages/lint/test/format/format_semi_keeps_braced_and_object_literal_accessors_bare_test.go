package linthost

import "testing"

// TestFormatSemiKeepsBracedAndObjectLiteralAccessorsBare verifies the two
// shapes the accessor kinds reach that must never take a terminator.
//
// GetAccessor and SetAccessor spell three different members: a bodiless
// interface accessor (terminated), a class accessor with a body (Prettier
// never follows a braced member with `;`), and an object-literal accessor
// (whose list is comma-separated, so a `;` there is a syntax error). A
// kind-only insert would corrupt the third and diverge on the second, so
// both negatives are pinned against the positive twin in
// format_semi_terminates_broken_interface_members_test.go.
//
//  1. Parse a class accessor with a body and an object-literal accessor,
//     each ending in `}` on its own line.
//  2. Run format/semi with default options.
//  3. Assert the rule reports nothing.
func TestFormatSemiKeepsBracedAndObjectLiteralAccessorsBare(t *testing.T) {
  assertRuleSkipsSource(
    t,
    "format/semi",
    "class Value {\n"+
      "  get first(): string {\n"+
      "    return \"first\";\n"+
      "  }\n"+
      "}\n"+
      "const holder = {\n"+
      "  get first(): string {\n"+
      "    return \"first\";\n"+
      "  },\n"+
      "};\n",
  )
}
