# AGENTS.md — `effect-workflow/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-workflow` cell spec and `CONSTITUTION.md` Articles I–II. Read the cell skill for what a workflow must be — restating it here would create a second copy that drifts.

```yaml
- id: EW1
  title: Keep an obligation, not only prohibitions
  do: keep a rule that fails a workflow for LACKING something
  dont: reduce the set to conditional prohibitions
  harm: typeid-required, no-unconstructed-variant and no-panic-vocabulary all gate on a schema declaration existing — with prohibitions alone, plain TS unions make all three vacuous at once and avoiding Effect Schema becomes the cheapest way to pass
  check: workflow-schema-required is registered and enabled in configs.recommended

- id: EW2
  title: RuleTester is the only test mechanism
  do: test through the colocated src/rules/__tests__/<rule>.test.ts suite
  dont: spawn oxlint as a subprocess, import dist/, or assert on configs/meta shape
  harm: a lint run inside the lint suite cost 17s and needed a 120s timeout, asserting what one unit assertion already covers
  check: every src/**/*.test.ts constructs a RuleTester

- id: EW3
  title: Filesystem-backed rules are untestable here
  do: leave "every workflow has a property test" to the consumer's coverage and mutation gates
  dont: stat the filesystem for a sibling test file
  harm: RuleTester resolves every filename into node_modules, so such a rule can never have a passing valid case — and an untestable rule cannot meet MG1
  check: no rule imports node:fs

- id: EW4
  title: Schema detection matches the S namespace only
  do: match the identifier S in both the curried and direct TaggedClass/TaggedError forms
  dont: also accept Schema. or an alias
  harm: every rule here hardcodes S; widening one makes its near-miss tests meaningless and puts it out of step with its siblings
  check: each schema-detecting rule has a valid case proving Schema.TaggedClass does not fire
```
