package linthost

import "testing"

// TestFormatBracketSpacingPadsAnUnspacedTypeLiteral verifies the pad is applied
// even when the interior is not in Prettier's shape.
//
// The one output the format set produces that neither the author wrote nor
// Prettier emits, and it is a decision rather than an oversight: recognizing
// that `alpha:number;bravo:string` is unspaced is the token-spacing analysis the
// set does not have, and abstaining on that suspicion would also lose the
// `{alpha: 1}` to `{ alpha: 1 }` fix, which agrees with Prettier. The guide
// states this under "Partial normalization"; the case is what keeps it true.
//
//  1. Parse a type literal with neither brace padding nor interior spacing.
//  2. Apply format/bracket-spacing with spacing:true.
//  3. Assert the braces gain their padding and the interior is untouched.
func TestFormatBracketSpacingPadsAnUnspacedTypeLiteral(t *testing.T) {
  assertFixSnapshotWithOptions(
    t,
    "format/bracket-spacing",
    "export type J = {alpha:number;bravo:string};\n",
    `{"spacing":true}`,
    "export type J = { alpha:number;bravo:string };\n",
  )
}
