package linthost

import "testing"

// TestFormatBracketSpacingLeavesAPrettierShapedTypeLiteralAlone verifies the
// same type literal in Prettier's own shape produces no edit.
//
// The negative twin of the unspaced pad, and the fixed-point half of the
// guide's claim: a file already formatted by Prettier must come out
// byte-identical. Without it, the pad case alone would still pass if the rule
// rewrote every type literal it saw.
//
//  1. Parse the Prettier 3.8.3 output for the same declaration.
//  2. Run format/bracket-spacing with spacing:true.
//  3. Assert the rule reports nothing.
func TestFormatBracketSpacingLeavesAPrettierShapedTypeLiteralAlone(t *testing.T) {
  assertRuleSkipsSourceWithOptions(
    t,
    "format/bracket-spacing",
    "export type J = { alpha: number; bravo: string };\n",
    `{"spacing":true}`,
  )
}
