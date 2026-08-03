# AGENTS.md — `effect-executor/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-executor` cell spec (`*.executor.ts` — the impure shell around one pure workflow) and `CONSTITUTION.md` Article II. Read the cell skill for what an executor must be; restating it here would create a second copy that drifts.

```yaml
- id: EE1
  title: Cell classification comes from the import edge, never from a name
  do: resolve a module source through `cellOf` in `src/rules/cell.ts` and key the rule on the cell it returns
  dont: infer a cell from an identifier's spelling, a `Deps` suffix, or a call's shape
  harm: identifier-shaped heuristics misfire on every legitimately named binding; the import edge is the only evidence the AST actually carries
  check: every rule that classifies a value traces it to an `ImportDeclaration` source

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
  check: "`executor-no-domain-branch` has a valid case dispatching over a workflow result and an invalid case dispatching over a decoded value"

- id: EE5
  title: Deliberate non-gates
  do: leave sandwich ORDERING (EX3c), read completeness (EX3b), the data-integrity allowlist (EX4b), and anti-pattern FILE NAMES (EX5) to review
  dont: add a rule for them here
  harm: ordering needs a READ/WRITE distinction the AST cannot supply — the writing methods arrive through Context.Tag destructuring, so no import edge names their cell; read completeness and the allowlist need cross-module type resolution or a domain judgment; EX5 is family-wide and belongs to a naming rule in the shared plugin, not to twelve per-cell copies
  check: no rule in `src/rules/` claims to enforce statement order, read completeness, or filename bans

- id: EE6
  title: Private executor composition is internal
  do: allow an executor to import another executor only when the module specifier contains an `internal` path segment
  dont: allow public-to-public executor imports or treat `internal` inside a filename or package name as a path segment
  harm: banning private helpers drives effectful composition into the entrypoint, while allowing public executor composition couples use cases sideways
  check: `executor-import-boundary` covers static and dynamic imports for internal segments, public siblings, and substring near-misses
```
