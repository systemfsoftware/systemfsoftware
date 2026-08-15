package linthost

import "testing"

// TestFormatSemiTerminatesAMemberWhoseTypeEndsInABrace verifies a member
// whose TYPE is a broken object literal is still terminated.
//
// It is the twin that separates the two ways a member can end in `}`. A
// class accessor with a body ends in the `}` of that body and Prettier
// never follows it with `;`, so the abstention has to key on the member
// carrying a body, not on its last byte: a `src[end-1] == '}'` test would
// read this member the same way and leave it bare. Prettier 3.8.3 closes
// this one with `};`.
//
//  1. Parse an interface member whose nested type literal is broken across
//     lines and whose own terminator is missing.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert the `;` lands after the nested closing brace.
func TestFormatSemiTerminatesAMemberWhoseTypeEndsInABrace(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "interface Outer {\n  nested: {\n    inner: number;\n  }\n}\n",
    "interface Outer {\n  nested: {\n    inner: number;\n  };\n}\n",
  )
}
