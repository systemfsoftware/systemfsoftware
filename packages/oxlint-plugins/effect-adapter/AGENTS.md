# AGENTS.md — `effect-adapter/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-adapter` cell — read `skill://architect-adapter` for what a `*.adapter.ts` must be; restating it here would create a second copy that drifts.

```yaml
- id: EA1
  title: Filename suffix is the gate
  do: key every rule on `context.filename.endsWith('.adapter.ts')` and no-op everywhere else
  dont: widen to other suffixes
  harm: the suffix names the technology — a rule that fires outside the cell bleeds into unrelated files
  check: each rule's create() starts with the suffix gate
- id: EA2
  title: One external system per file
  do: keep adapter-single-external-system counting distinct foreign package roots, scoped (`@aws-sdk/client-s3`) and unscoped (`stripe`)
  dont: treat `effect/*`, `node:*`, or relative imports as foreign systems
  harm: the file is named for one technology; a second SDK makes the name a lie
  check: adapter-single-external-system is registered and enabled in configs.recommended
- id: EA3
  title: Decode-only means no casts
  do: keep adapter-no-cast reporting every TSAsExpression and TSTypeAssertion except `as const`
  dont: exempt `as unknown as` or `as any` — they erase the most information
  harm: a cast skips the boundary decode, so the type system is lied to and the decode failure never becomes typed
  check: every adapter-no-cast test asserts the report data fields
- id: EA4
  title: The whitelist is the template's import surface
  do: allow relative imports of the port (executor), the domain error type (schema), and the foreign shape; forbid every other cell suffix
  dont: add `.workflow` or `.state` to the allowlist
  harm: an import outside the template is an active choice that needs review, not a silent default
  check: adapter-no-domain-cell-imports has an invalid case per forbidden suffix
- id: EA5
  title: The adapter delivers a Layer
  do: keep adapter-layer-required — the obligation rule — matching only the `Layer` namespace with `effect`/`succeed`
  dont: widen to aliased imports (`L.effect`) or bracket access
  harm: the Layer is what the composition root wires; without it the port has no implementation to select
  check: every rule file passes meta straight to defineRule (OX-CS1)
```
