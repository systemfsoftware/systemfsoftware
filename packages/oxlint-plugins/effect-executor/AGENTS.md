# AGENTS.md — `effect-executor/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate the `architect-executor` cell spec (`*.executor.ts` — the impure shell around one pure workflow) and `CONSTITUTION.md` Article II.

```yaml
- id: EE1
  title: Cell classification comes from the import edge, never from a name
  do: resolve a module source through `cellOf` in `src/rules/cell.ts` and key the rule on the cell it returns
  dont: infer a cell from an identifier's spelling, a `Deps` suffix, or a call's shape
  harm: identifier-shaped heuristics misfire on every legitimately named binding; the import edge is the only evidence the AST actually carries
  check: review — every rule that classifies a value traces it to an `ImportDeclaration` source

- id: EE2
  title: A rule ships only when it has no legitimate counterexample
  do: run a candidate rule against the repo's real `*.executor.ts` files before wiring it; if it fires on code the theory sanctions, find the subset that does not and ship that instead
  dont: ship a rule that needs an allowlist, an override, or a `// eslint-disable` to let correct code through
  harm: a rule that fires on code the architecture sanctions trains the team to disable it, and a disabled rule enforces nothing
  check: "`pnpm -r lint` is clean across every real executor in the repo with the rule enabled"

- id: EE3
  title: Translation is not decision
  do: let the executor dispatch over the decision a workflow RETURNED; flag only dispatch over a value that came out of an ACL or store call
  dont: ban `Match` outright in `*.executor.ts`
  harm: the executor's sanctioned job is to translate the decision, which requires dispatching on it — a blanket ban flags the correct implementation
  check: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-executor test` exits 0 — it pins the valid workflow-dispatch case and the invalid decoded-dispatch case of executor-no-domain-branch

- id: EE5
  title: Deliberate non-gates
  do: leave sandwich ORDERING (EX3c), read completeness (EX3b), the data-integrity allowlist (EX4b), and anti-pattern FILE NAMES (EX5) to review
  dont: add a rule for them here
  harm: ordering needs a READ/WRITE distinction the AST cannot supply — the writing methods arrive through Context.Tag destructuring, so no import edge names their cell; read completeness and the allowlist need cross-module type resolution or a domain judgment; EX5 is family-wide and belongs to a naming rule in the shared plugin, not to twelve per-cell copies
  check: review — no rule in `src/rules/` claims to enforce statement order, read completeness, or filename bans
```
