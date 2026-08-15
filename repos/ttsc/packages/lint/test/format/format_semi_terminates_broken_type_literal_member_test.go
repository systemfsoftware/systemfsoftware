package linthost

import "testing"

// TestFormatSemiTerminatesBrokenTypeLiteralMember verifies a type literal
// written across lines takes the terminator while an inline one does not.
//
// Prettier preserves an object type's authored wrap: a literal whose `{`
// is followed by a line break stays broken and terminates its members,
// and one written inline stays inline and leaves its last member bare.
// Keying the insert on the member's own line structure reproduces both
// halves without a second layout model, so the two literals below must
// come out differently from one run of the same rule.
//
//  1. Parse a broken type literal and an inline one.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert only the broken literal's member gains a `;`.
func TestFormatSemiTerminatesBrokenTypeLiteralMember(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "type Broken = {\n  name: string\n};\ntype Inline = { name: string };\n",
    "type Broken = {\n  name: string;\n};\ntype Inline = { name: string };\n",
  )
}
