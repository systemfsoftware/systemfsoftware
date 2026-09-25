---
description: "A solution doc's problem_type must be one of the 17 enum values; any other spelling hides the doc from the learnings search that routes on the exact value."
condition:
  - '(?<!"old_string"\s*:\s*"[^"]*)(?:^|\n|\\n)\+?problem_type:[ \t]*["'']?(?!(?:build_error|test_failure|runtime_error|performance_issue|database_issue|security_issue|ui_bug|integration_issue|logic_error|architecture_pattern|design_pattern|tooling_decision|convention|workflow_issue|developer_experience|documentation_gap|best_practice)["'']?[ \t]*(?:#[^\n]*)?(?:$|\r?\n|\\n))[^\s"''#]'
scope: "tool:write(**/docs/solutions/**/*.md), tool:edit(**/docs/solutions/**/*.md), tool:ast_edit(**/docs/solutions/**/*.md), tool:write(**/solutions/**/*.md), tool:edit(**/solutions/**/*.md), tool:ast_edit(**/solutions/**/*.md)"
interruptMode: never
recurrence: recurring
---

# problem_type is not one of the 17 enum values

The learnings researcher greps `problem_type` for exact enum values when it looks for decision- and pattern-shaped learnings, so a hyphenated or invented value drops this doc out of that search; only its title, tags, or module can still surface it.

Next edit: set `problem_type` to exactly one of `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention`, `workflow_issue`, `developer_experience`, `documentation_gap`, `best_practice`. The folder is a default layout, not a constraint: keep the doc where the corpus files that area.

Never a violation: a valid value, the key named in prose or in a code span, and an edit's `old_string`.

Re-issue is not a new trigger when the write sets one of the 17 values.
