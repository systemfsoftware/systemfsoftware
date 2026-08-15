package linthost

import "testing"

// TestFormatSemiKeepsAFlatObjectTypesLastMemberBare verifies an object type
// the author opened on one line keeps its last member bare, wherever the
// closing brace landed.
//
// Prettier preserves an object type's wrap by the break between its `{`
// and its first member, not by where the `}` sits, and prints the trailing
// terminator only for a list it breaks. It returns
// `type Flat = { flat: number\n};` as `type Flat = { flat: number };`, so
// reading the newline at the member would insert a `;` the oracle never
// prints. The two terminators that are still owed are the contrast: a
// separator between two members is printed in either layout, and an
// interface body always breaks however its member's own type was written.
//
//  1. Parse a flat-opened object type, a flat-opened one whose members are
//     split, and an interface member whose type is a flat-opened literal.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert only the inter-member separator and the interface member gain
//     a `;`.
func TestFormatSemiKeepsAFlatObjectTypesLastMemberBare(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "type Flat = { flat: number\n};\n"+
      "type Split = { alpha: number\n  bravo: string };\n"+
      "interface Outer {\n  nested: { inner: number\n  }\n}\n",
    "type Flat = { flat: number\n};\n"+
      "type Split = { alpha: number;\n  bravo: string };\n"+
      "interface Outer {\n  nested: { inner: number\n  };\n}\n",
  )
}
