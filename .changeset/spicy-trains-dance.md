---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": minor
---

decision-code-imports reads Effect 4 schema use: a workspace schema may be the receiver of .annotate, .check, .literal, .literals, .guards, .match and .cases (their call arguments are still read), the receiver of .pipe when every argument is an S.* combinator, a command, decision or error field of effect-cell-types Workflow.make, or an argument of a function declared in the same file or a relative decision module.
