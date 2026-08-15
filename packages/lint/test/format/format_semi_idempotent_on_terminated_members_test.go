package linthost

import "testing"

// TestFormatSemiIdempotentOnTerminatedMembers verifies the member insert is
// idempotent on its own output.
//
// The inserted `;` is folded back into the member's range by the next
// parse, so the second pass must read it at End()-1 and abstain. A rule
// that re-reported here would spin the format cascade to its pass cap and
// exit non-zero, and would break the fixed point an already-Prettier-shaped
// file is entitled to.
//
//  1. Parse a Prettier-shaped interface, type literal, and class body.
//  2. Run format/semi with default options.
//  3. Assert the rule reports nothing.
func TestFormatSemiIdempotentOnTerminatedMembers(t *testing.T) {
  assertRuleSkipsSource(
    t,
    "format/semi",
    "interface Shape {\n"+
      "  value: string;\n"+
      "  method(): void;\n"+
      "  [key: string]: string;\n"+
      "  (): void;\n"+
      "  new (): Shape;\n"+
      "}\n"+
      "type Alias = {\n"+
      "  name: string;\n"+
      "};\n"+
      "class Value {\n"+
      "  [key: string]: string;\n"+
      "}\n",
  )
}
