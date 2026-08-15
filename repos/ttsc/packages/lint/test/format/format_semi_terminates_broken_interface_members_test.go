package linthost

import "testing"

// TestFormatSemiTerminatesBrokenInterfaceMembers verifies the always
// direction reaches every interface member kind, the last one included.
//
// The member kinds sat in `Visits()` and then short-circuited before the
// insert branch, so `ttsc format` split a one-line interface body and left
// its members bare (samchon/ttsc#1166). Prettier 3.8.3 terminates each of
// the seven member spellings once the body is broken across lines, so one
// interface holding all of them pins the whole kind set in one edit pass.
//
//  1. Parse an interface whose seven members are each on their own line
//     with no terminator.
//  2. Apply format/semi through the disk-backed fixer.
//  3. Assert every member gained a `;`.
func TestFormatSemiTerminatesBrokenInterfaceMembers(t *testing.T) {
  assertFixSnapshot(
    t,
    "format/semi",
    "interface Shape {\n"+
      "  value: string\n"+
      "  method(): void\n"+
      "  [key: string]: string\n"+
      "  (): void\n"+
      "  new (): Shape\n"+
      "  get first(): string\n"+
      "  set first(next: string)\n"+
      "}\n",
    "interface Shape {\n"+
      "  value: string;\n"+
      "  method(): void;\n"+
      "  [key: string]: string;\n"+
      "  (): void;\n"+
      "  new (): Shape;\n"+
      "  get first(): string;\n"+
      "  set first(next: string);\n"+
      "}\n",
  )
}
