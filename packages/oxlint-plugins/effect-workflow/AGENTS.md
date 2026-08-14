# AGENTS.md — `effect-workflow/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate the `architect-workflow` cell spec and `CONSTITUTION.md` Articles I–II.

```yaml
- id: EW1
  title: workflow-schema-required, this package's OX-OB1 obligation rule
  do: keep a rule that fails a workflow for LACKING something
  dont: relax workflow-schema-required so it fires only when a schema declaration is already present
  harm: typeid-required, no-unconstructed-variant and no-panic-vocabulary all gate on a schema declaration existing — with prohibitions alone, plain TS unions make all three vacuous at once and avoiding Effect Schema becomes the cheapest way to pass
  check: `grep -q "rule('workflow-schema-required')" src/index.ts && grep -q "'workflow-schema-required': workflowSchemaRequired" src/index.ts` — registered and enabled in configs.recommended

- id: EW4
  title: Schema detection matches the S namespace only
  do: match the identifier S in both the curried and direct TaggedClass/TaggedError forms
  dont: also accept Schema. or an alias
  harm: the near-miss valid cases exist to prove `Schema.TaggedClass` does NOT fire a schema-detecting rule; widen the match and they stop separating the curried form from the direct one, which is the whole distinction EW4 guards
  check: review — every schema-detecting rule has a valid case proving Schema.TaggedClass does not fire
```
