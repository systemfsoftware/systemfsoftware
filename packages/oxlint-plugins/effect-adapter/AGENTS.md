# AGENTS.md — `effect-adapter/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

```yaml
- id: EA1
  title: Filename suffix is the gate
  do: key every rule on `context.filename.endsWith('.adapter.ts')` and no-op everywhere else
  dont: widen to other suffixes
  harm: the suffix names the technology — a rule that fires outside the cell bleeds into unrelated files
  check: "`grep -A2 \"create(context\" src/rules/*.ts` shows every rule file's create() opening with the suffix gate"
- id: EA2
  title: One external system per file
  do: keep adapter-single-external-system counting distinct foreign package roots, scoped (`@aws-sdk/client-s3`) and unscoped (`stripe`)
  dont: treat `effect/*`, `node:*`, or relative imports as foreign systems
  harm: the file is named for one technology; a second SDK makes the name a lie
  check: "`grep -n \"adapter-single-external-system\" src/index.ts` shows the rule in `rules` and as 'error' in `configs.recommended`"
- id: EA3
  title: Decode-only means no casts
  do: keep adapter-no-cast reporting every TSAsExpression and TSTypeAssertion except `as const`
  dont: exempt `as unknown as` or `as any` — they erase the most information
  harm: a cast skips the boundary decode, so the type system is lied to and the decode failure never becomes typed
  check: "`grep -c \"data:\" src/rules/__tests__/adapter-no-cast.test.ts` equals the `messageId:` count — every invalid case asserts its report data fields"
- id: EA5
  title: The adapter delivers a Layer
  do: keep adapter-layer-required — the obligation rule — matching only the `Layer` namespace with `effect`/`succeed`
  dont: widen to aliased imports (`L.effect`) or bracket access
  harm: the Layer is what the composition root wires; without it the port has no implementation to select
  check: `grep -rn -A1 "defineRule({" src/rules/*.ts` shows every rule file passing the imported config meta straight
```
