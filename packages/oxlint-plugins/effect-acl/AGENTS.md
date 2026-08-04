# AGENTS.md — `effect-acl/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-acl` cell spec. Read the cell skill for what an ACL must be — restating it here would create a second copy that drifts. Every rule keys on the `*.acl.ts` filename suffix and no-ops on every other file.

```yaml
- id: EA1
  title: acl-transform-orfail-required is this cell's OX-OB1 obligation
  do: keep acl-transform-orfail-required registered — a .acl.ts with no S.transformOrFail call is not an ACL
  dont: relax acl-transform-orfail-required so it fires only when a transform is already present
  harm: with only prohibitions, an empty .acl.ts passes and the cell collapses into a naming convention
  check: acl-transform-orfail-required is enabled in configs.recommended

- id: EA2
  title: transformOrFail detection matches the S namespace only
  do: match the S identifier and the transformOrFail member property
  dont: also accept Schema., an alias, or a computed member
  harm: the near-miss valid cases exist to prove `Schema.transformOrFail` does NOT satisfy a transform-detecting rule; widen the match and every one of them passes vacuously, so the suite stops distinguishing the two forms it was written to separate
  check: each transform-detecting rule has a valid case proving Schema.transformOrFail does not satisfy it

- id: EA3
  title: Cast detection is AST-only, no type information
  do: report every TSAsExpression in an .acl.ts file
  dont: distinguish cast targets by anything but the AST annotation node
  harm: a rule needing type information cannot be tested by RuleTester and fails the mutation gate
  check: no rule imports node:fs and every suite passes with RuleTester alone

- id: EA4
  title: Path rules read '/' segments only
  do: check directory segments against the ACL5 lint list (core, shell, util, utils, helper, manager, service)
  dont: extend the list — the broader technology-layer ban (entities/, components/, helpers/, routes/) is convention-only
  harm: widening beyond the gate's lint check makes the rule un-gateable and collides with cell-taxonomy's ownership of basenames
  check: helpers/ is a valid-case near-miss in acl-no-anti-pattern-path tests
```

Review-gated ACL gates (ACL1 unidirectionality, ACL3 `strict: true`, ACL4 no business logic in decode/encode) are not lint rules here — they are enforced by the store's composition tests and code review, per the cell skill.
