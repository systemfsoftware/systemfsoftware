package strip_test

import (
  "path/filepath"
  "testing"
)

// TestRealpathIfPossibleKeepsAnUnevaluablePath verifies a path that cannot be
// evaluated is returned unchanged rather than emptied.
//
// The compiler resolution realpaths the `typescript` install before hopping to
// its platform sibling. filepath.EvalSymlinks fails on a path that does not
// exist and on an NTFS junction it refuses to traverse, and answering "" there
// would turn a resolvable install into an upward walk from the filesystem root.
// Returning the input keeps the failure inert.
//
//  1. Realpath a directory that exists and assert it still names something.
//  2. Realpath a path below it that does not exist.
//  3. Assert the missing path comes back verbatim.
func TestRealpathIfPossibleKeepsAnUnevaluablePath(t *testing.T) {
  root := t.TempDir()
  if real := stripRealpathIfPossible(root); real == "" {
    t.Fatal("stripRealpathIfPossible emptied an existing directory")
  }

  missing := filepath.Join(stripRealpathIfPossible(root), "no-such-directory", "package.json")
  if got := stripRealpathIfPossible(missing); got != missing {
    t.Fatalf("stripRealpathIfPossible = %q, want the unevaluable path %q back", got, missing)
  }
}
