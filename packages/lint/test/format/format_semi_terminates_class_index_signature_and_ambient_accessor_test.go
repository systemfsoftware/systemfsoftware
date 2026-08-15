package linthost

import "testing"

// TestFormatSemiTerminatesClassIndexSignatureAndAmbientAccessor verifies the
// class-body spellings of the member kinds take the same terminator.
//
// An index signature and a bodiless `declare` accessor are class members
// written as type members, and format/indent breaks them onto their own
// lines exactly as it breaks an interface member, so leaving them out of
// the insert would keep the same unterminated shape samchon/ttsc#1166
// reports for interfaces. Prettier terminates both.
//
//  1. Parse a class with an index signature and an ambient class with a
//     bodiless getter, each unterminated on its own line.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert both members gain a `;`.
func TestFormatSemiTerminatesClassIndexSignatureAndAmbientAccessor(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "class Value {\n  [key: string]: string\n}\ndeclare class Ambient {\n  get first(): string\n}\n",
    "class Value {\n  [key: string]: string;\n}\ndeclare class Ambient {\n  get first(): string;\n}\n",
  )
}
