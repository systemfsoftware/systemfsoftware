# AGENTS.md — `effect-state/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-state` cell spec — read `skill://architect-state` for what a valid `*.state.ts` is. This leaf never restates it.

```yaml
- id: ES1
  title: Keep the obligation, not only prohibitions
  do: keep state-quarantine-holds-state registered — a *.state.ts that constructs no escaping coordination primitive at module scope is a misnamed service, and without the obligation the remaining rules pass vacuously on empty shells
  dont: drop it because raw-export and single-tag already reject empty files — a Tag-plus-Live service with all state operation-local passes those
  harm: dropping the obligation turns the quarantine into a naming convention — a *.state.ts holding no escaping state passes every remaining rule, and the cell label stops meaning the one place live process state may escape
  check: `grep -n 'state-quarantine-holds-state' packages/oxlint-plugins/effect-state/src/index.ts` returns the import, the rules registration, and the configs.recommended 'error' entry

- id: ES2
  title: Escape, not construction — module scope is the judge
  do: count only module-scope constructions in holds-state and raw-primitive-exports; a Ref/Map/Deferred constructed inside a function or method is operation-local and stays inline in its host
  dont: treat operation-local primitives as satisfying the quarantine
  harm: the skill's granularity rule is the load-bearing distinction; blurring it manufactures shallow state cells
  check: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-state test` exits 0 — holds-state keeps Should_Report_NoStatePrimitive_When_StateInsideArrowFunction and Should_Report_NoStatePrimitive_When_StateInsideFunctionDeclaration red and Should_Pass_When_FunctionDeclarationBesideModuleScopeMap green

- id: ES3
  title: Tag detection matches the Context namespace only
  do: match the identifier Context.Tag in both the class-extends and const call-chain forms
  dont: also accept Context.GenericTag or an aliased Context import
  harm: mirror of EW4 — widening one detection rule makes its near-miss tests meaningless
  check: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-state test` exits 0 — state-single-tag-export keeps Should_Pass_When_GenericTagNearMiss green

- id: ES4
  title: Adapter imports are value imports only
  do: flag only non-type imports of *.adapter.* sources in state files; `import type` is erased and harmless
  dont: flag type-only imports or folder names like ./adapters
  harm: a type-only import is erased before the boundary rule's premise exists, so flagging it is a false positive that forces needless churn; flagging folder names reports files that never imported a cell — either makes authors suppress the rule and the quarantine loses its signal
  check: `grep -n -e 'Should_Pass_When_StateImportsAdapterAsTypeOnly' -e 'Should_Report_StateImportingAdapterAsValue' packages/oxlint-plugins/cell-imports/src/rules/__tests__/cell-import-boundary.test.ts` returns both cases; the ./adapters folder near-miss has no suite case — review: confirm the boundary rule still ignores folder-name imports
```
