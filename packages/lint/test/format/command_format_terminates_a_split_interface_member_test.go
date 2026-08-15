package linthost

import "testing"

// TestCommandFormatTerminatesASplitInterfaceMember verifies the cascade
// reaches Prettier's shape for a one-line interface body.
//
// samchon/ttsc#1166: format/indent broke the body out and format/semi then
// declined every type member, so the run ended on `alpha: number` with no
// terminator, a shape Prettier never emits. Only the LAST member showed it
// in a multi-member body, because the interior `;` was already written as a
// separator, which made the output internally inconsistent rather than
// uniformly bare. This is the cascade case, not the rule case: the insert
// waits for the break, so it lands one pass after the split.
//
//  1. Seed one-member and two-member interfaces written on one line.
//  2. Run `ttsc format`.
//  3. Assert the file equals Prettier 3.8.3's output, every member
//     terminated.
func TestCommandFormatTerminatesASplitInterfaceMember(t *testing.T) {
  assertFormatResult(
    t,
    "export interface Alpha { alpha: number }\n"+
      "export interface Bravo { alpha: number; bravo: string }\n",
    "export interface Alpha {\n"+
      "  alpha: number;\n"+
      "}\n"+
      "export interface Bravo {\n"+
      "  alpha: number;\n"+
      "  bravo: string;\n"+
      "}\n",
  )
}
