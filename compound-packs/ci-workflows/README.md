# CI Workflows

What a CI check is for: catching defects in shipped artifacts, never grading the repository itself. Work that adds, moves or removes a CI job must honor it. This pack has one rule; workflow configuration (pins, timeouts, caches, lanes, required checks) is configuration and carries no rule.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: ci-workflows, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
