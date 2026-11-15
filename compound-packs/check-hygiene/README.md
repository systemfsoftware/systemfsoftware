# Check Hygiene

What a CI check is for—catching defects in shipped artifacts, never grading the repository itself—and when a lint rule may be proposed and the shape it must ship in. Work that adds, moves or removes a CI job or lint rule must honor it. Workflow configuration (pins, timeouts, caches, lanes, required checks) is configuration and carries no rule.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: check-hygiene, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
