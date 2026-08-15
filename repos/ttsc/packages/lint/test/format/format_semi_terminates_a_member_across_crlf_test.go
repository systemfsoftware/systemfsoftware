package linthost

import "testing"

// TestFormatSemiTerminatesAMemberAcrossCrlf verifies the member insert
// recognizes a CRLF break, so a CRLF interface is terminated exactly like
// an LF one.
//
// The insert fires only when a line break separates the member from the
// next significant byte. A scan that read `\r` as ordinary whitespace
// rather than a line terminator would see the closing `}` as same-line and
// abstain, leaving every CRLF file unformatted while LF files converged.
// The `\r\n` bytes must also survive the edit, which is zero-width and so
// never rewrites them.
//
//  1. Parse a CRLF interface whose member carries no terminator.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert the `;` is inserted and the CRLF endings are preserved.
func TestFormatSemiTerminatesAMemberAcrossCrlf(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "interface Shape {\r\n  value: string\r\n}\r\n",
    "interface Shape {\r\n  value: string;\r\n}\r\n",
  )
}
