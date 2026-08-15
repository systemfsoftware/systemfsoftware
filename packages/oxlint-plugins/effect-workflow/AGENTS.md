# AGENTS.md — `effect-workflow/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate the `architect-workflow` cell spec and `CONSTITUTION.md` Articles I–II.

```yaml
- id: EW1
  title: The obligation is upstream; this package holds prohibitions only
  do: leave "a workflow must declare its Command, Decision and Error as S.TaggedClass /
    S.TaggedError" to the declaration language and `guard-workflow-authorship` — the
    declaration cannot express a cell without them, and the gate requires every
    `*.workflow.ts` to be a declaration's emission
  dont: add a rule here that MUST fail a workflow for lacking a declaration, on the argument
    that prohibitions alone are vacuous against a plain TS union
  harm: the argument is sound and the instrument is wrong. `typeid-required`,
    `no-unconstructed-variant` and `no-panic-vocabulary` all keyed on a schema declaration
    existing, so with prohibitions alone a plain TS union made them vacuous at once and
    avoiding Effect Schema was the cheapest way to pass. A walker reading the finished text
    can only report that afterwards; the declaration decides it before the file exists, which
    is why the obligation belongs there and a second copy here is a rule that can never fire
    on an emitted cell
  check: `deno run scripts/guards/guard-cell-authorship.ts --selftest` passes and
    `pnpm turbo //#check:cell-authorship` exits 0 — every workflow cell is emitted, so no
    hand-authored union can reach a rule here

- id: EW4
  title: Schema detection matches the S namespace only
  do: match the identifier S in both the curried and direct TaggedClass/TaggedError forms
  dont: also accept Schema. or an alias
  harm: the near-miss valid cases exist to prove `Schema.TaggedClass` does NOT fire a schema-detecting rule; widen the match and they stop separating the curried form from the direct one, which is the whole distinction EW4 guards
  check: review — every schema-detecting rule has a valid case proving Schema.TaggedClass does not fire
```
