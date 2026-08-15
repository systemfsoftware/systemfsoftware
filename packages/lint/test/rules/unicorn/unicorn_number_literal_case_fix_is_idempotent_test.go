package linthost

import "testing"

// TestUnicornNumberLiteralCaseFixIsIdempotent verifies the fixed source is a
// fixed point: re-linting it reports nothing.
//
// `ttsc fix` runs the cascade until no edit is produced, so a fixer that
// emitted a still-non-canonical literal would re-report its own output and burn
// every pass before the harness gives up. Feeding each rewritten source back
// through the rule proves the emitted spelling is the one the rule accepts —
// for the exponent, prefix, hex-digit, and BigInt branches alike.
//
//  1. Fix a non-canonical literal of each branch.
//  2. Re-run the rule on the rewritten source.
//  3. Assert the second run finds nothing.
func TestUnicornNumberLiteralCaseFixIsIdempotent(t *testing.T) {
  for _, source := range []string{
    "const n = 1E10;\n",
    "const n = 2E-5;\n",
    "const n = 0Xff;\n",
    "const n = 0xffe10;\n",
    "const n = 0B1010;\n",
    "const n = 0xffn;\n",
  } {
    fixed, applied := runFixSnapshot(t, unicornNumberLiteralCaseRuleName, source)
    if applied == 0 {
      t.Fatalf("expected a fix for %q", source)
    }
    _, _, findings := runRuleFindingsSnapshot(
      t,
      unicornNumberLiteralCaseRuleName,
      fixed,
      nil,
    )
    if len(findings) != 0 {
      t.Fatalf("fixed source %q still reports %d findings: %+v", fixed, len(findings), findings)
    }
  }
}
