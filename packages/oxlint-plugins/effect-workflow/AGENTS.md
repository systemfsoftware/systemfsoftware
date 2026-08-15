# AGENTS.md — `effect-workflow/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate `CONSTITUTION.md` Articles I–II.

```yaml
- id: EW1
  title: The obligation is upstream; this package holds prohibitions only
  do: leave "a workflow must declare its Command, Decision and Error as S.TaggedClass /
    S.TaggedError" to `Workflow.make`, whose `Inhabited` constraint refuses an uninhabited or
    untagged channel at the construction site and names the fix in the diagnostic
  dont: add a rule here that MUST fail a workflow for lacking a `Workflow.make` declaration,
    on the argument that prohibitions alone are vacuous against a plain TS union
  harm: the argument is sound and the instrument is wrong. Prohibitions alone are vacuous
    against a plain TS union, and avoiding Effect Schema was the cheapest way to pass them.
    A walker reading the finished file can only report the absence afterwards;
    `Workflow.make` refuses it before the file exists, so the obligation belongs there and a
    second copy here would report a violation `Workflow.make` should have refused
  check: "`Workflow.make` decides whether a workflow declares its Command, Decision and
    Error; review whether a proposed rule would fail a workflow for lacking that declaration"
```
