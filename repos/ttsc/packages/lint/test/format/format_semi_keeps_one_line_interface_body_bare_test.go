package linthost

import "testing"

// TestFormatSemiKeepsOneLineInterfaceBodyBare verifies the insert direction
// abstains while the body is still written on one line.
//
// The negative twin of the broken-body case: Prettier prints a member's
// terminator inside an `ifBreak`, so a list that has not broken separates
// its members with `;` and leaves the last one bare. Inserting here would
// emit `interface Alpha { alpha: number; }`, a shape Prettier never
// produces, and the same condition is what keeps an inline object type,
// which no pass breaks, in the shape Prettier preserves. The cascade
// instead lets format/indent break the body first and terminates the
// members on the next pass.
//
//  1. Parse two one-line interfaces, one member and two members. The
//     interior `;` of the second is a separator, not a terminator, so it
//     must not draw an edit either.
//  2. Run format/semi with default options.
//  3. Assert the rule reports nothing.
func TestFormatSemiKeepsOneLineInterfaceBodyBare(t *testing.T) {
  assertRuleSkipsSource(
    t,
    "format/semi",
    "interface Alpha { alpha: number }\ninterface Bravo { alpha: number; bravo: string }\n",
  )
}
