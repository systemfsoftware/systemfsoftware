package linthost

import "testing"

// TestCommandFormatSettlesAMemberTerminatorOnAPaddedLine verifies the member
// terminator composes with the pass that rewrites the very bytes it sits on.
//
// The insert is zero-width at the member's End(), and format/whitespace's
// trim deletes the run of spaces that starts at exactly that offset. Two
// edits sharing a start position are what the applier's coincidence rule
// governs, so this pins the composition rather than assuming it: the trim
// applies first (it ends later, so it sorts later and applies earlier under
// the reverse-order applier) and the `;` lands on the trimmed line, in one
// pass and with neither edit dropped.
//
// The settled shape is also Prettier 3.8.3's own output for this input, so
// the two passes together land on the oracle rather than on a merely
// self-consistent result.
//
//  1. Seed an interface member padded with trailing spaces and missing its
//     terminator.
//  2. Run `ttsc format`.
//  3. Assert the line is trimmed and terminated, with no stranded padding
//     between the type and the `;`.
func TestCommandFormatSettlesAMemberTerminatorOnAPaddedLine(t *testing.T) {
  assertFormatResult(
    t,
    "interface Shape {\n  value: string   \n}\n",
    "interface Shape {\n  value: string;\n}\n",
  )
}
