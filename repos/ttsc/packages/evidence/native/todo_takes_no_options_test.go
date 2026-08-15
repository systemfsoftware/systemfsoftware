package evidence

import (
  "testing"
)

/**
 * Verifies the rule refuses options through the host's marker interface.
 *
 * `AcceptsTtscLintOptions() false` is the whole runtime contract: the engine
 * validates options at construction, reports a configured object as
 * `invalid options for rule "evidence/todo": rule does not accept options`,
 * and skips the rule, so Check never runs against options. An unimplemented
 * marker silently defaults to accepting — a rule that means to have no
 * configuration surface would then take one without checking it — which is why
 * the declaration is pinned rather than assumed.
 *
 *  1. Read the rule's `AcceptsTtscLintOptions` declaration.
 *  2. Assert it refuses.
 */
func TestTodoRefusesOptions(t *testing.T) {
  if (todoRule{}).AcceptsTtscLintOptions() {
    t.Fatal("evidence/todo must refuse options; the host only reports a configured object for a rule that declares AcceptsTtscLintOptions() false")
  }
}
