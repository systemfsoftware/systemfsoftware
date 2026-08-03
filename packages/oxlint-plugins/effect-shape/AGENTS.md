# AGENTS.md — `effect-shape/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-shape` cell spec — `*.shape.ts`, the foreign-model declaration. Read the cell skill for what a shape must be; restating it here would create a second copy that drifts.

```yaml
- id: ES1
  title: The mechanical subset of the gates, and nothing more
  do: enforce the single-file-AST fragments of SH2 (no domain imports), SH3 (no behaviour), SH4 (one foreign system per file), and the SH6 lint list (no junk-drawer path segments); every rule keys on the `.shape.ts` filename suffix and no-ops on other files
  dont: attempt SH1 (the reverse direction needs cross-file knowledge) or SH5 (permanent review by its own rationale)
  harm: a rule that fires on code the architecture sanctions trains the team to disable it
  check: no rule imports node:fs and no rule needs type information

- id: ES2
  title: Behaviour means function or method bodies
  do: report function declarations, function-valued consts, class method bodies, and function default exports; treat interface method signatures and call-expression consts (foreign constructors like pgTable) as declaration
  dont: ban call expressions wholesale — the foreign constructor is the shape's reason to exist
  harm: banning pgTable() alongside behaviour would reject every sanctioned storage shape
  check: packages/effect-memfs/src/memory-file-system.shape.ts passes all four rules unchanged

- id: ES3
  title: Foreign-system detection is package roots
  do: treat the first path segment of a non-relative, non-`node:` import source as its foreign package root; count `export * from` re-exports the same way
  dont: maintain a domain-package allowlist — "a domain package" is not mechanically identifiable, so SH2 covers `.schema`-suffix siblings and other DMMF cells only
  harm: a name-based allowlist either misses the repo's domain packages or fires on sanctioned foreign ones
  check: every rule's valid and invalid cases assert the report `data` fields, never messageId alone
```
