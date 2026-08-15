package linthost

import (
  "strings"
  "testing"
)

// TestRuleCorpusReturnAwait verifies the lint rule corpus fixture
// return-await.ts under a real Program.
//
// `typescript/return-await` is type-aware: the engine's checker-less AST
// harness used by `assertRuleCorpusCase` skips it because Context.Checker is
// nil. The rule therefore reuses the `command_*` shape established by
// `no-floating-promises`'s corpus test: materialize a tsconfig project, run
// `ttsc lint check`, and assert on the rendered diagnostics.
//
// Fixture-shape parity with tests/test-lint/src/cases/return-await.ts is
// enforced by the TypeScript feature corpus; this Go scenario locks the
// minimum-viable trigger (`return getPromise()` inside a `try` block) so a
// future shim regression surfaces here without depending on the full fixture.
//
// 1. Seed a project that returns an unawaited Promise from inside a try block.
// 2. Run `check` with typescript/return-await enabled as error.
// 3. Assert the command exits non-zero and stderr mentions the rule.
func TestRuleCorpusReturnAwait(t *testing.T) {
  root := seedLintProject(t, `declare function getPromise(): Promise<number>;
async function main(): Promise<number> {
  try {
    return getPromise();
  } catch (err) {
    JSON.stringify(err);
    return 0;
  }
}
void main();
`)
  seedLintRules(t, root, map[string]string{"typescript/return-await": "error"})

  code, stdout, stderr := captureCommandOutput(t, func() int {
    return run([]string{
      "check",
      "--cwd", root,
      "--plugins-json", lintManifest(t),
    })
  })
  if code != 2 || stdout != "" || !strings.Contains(stderr, "[typescript/return-await]") {
    t.Fatalf("return-await diagnostic mismatch: code=%d stdout=%q stderr=%q", code, stdout, stderr)
  }
}
