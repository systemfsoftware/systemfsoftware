package linthost

import "testing"

// TestFormatSemiInsertsMemberTerminatorBeforeTrailingComment verifies the
// terminator lands at the member's end rather than at the end of its line.
//
// The edit is zero-width at End(), which sits before the member's trailing
// trivia, so a `// note` after the member keeps its position and its text.
// The comment is also what proves the line-structure test crosses trivia:
// the next significant byte is the `}` a line below, and scanPastTrivia has
// to walk the comment to see that break.
//
//  1. Parse an interface member followed by a line comment.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert the `;` lands before the comment and the comment survives.
func TestFormatSemiInsertsMemberTerminatorBeforeTrailingComment(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "interface Shape {\n  value: string // note\n}\n",
    "interface Shape {\n  value: string; // note\n}\n",
  )
}
