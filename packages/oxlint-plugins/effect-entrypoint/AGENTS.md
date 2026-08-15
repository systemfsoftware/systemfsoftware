# AGENTS.md — `effect-entrypoint/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate `main.ts` as a real interpretation edge. The spec of record is `skill://design-effect-entrypoint`.

```yaml
- id: EP1
  title: Keyed on a filename, not a cell suffix
  do: gate the exact basename `main.ts`
  dont: NEVER add `entrypoint` to the cell-taxonomy CELLS list or invent a `.entrypoint.ts` suffix
  harm: "`main.ts` is one of cell-taxonomy's EXEMPT names (`CT1`); making it a cell would give the same file two owners"
  check: "`grep -l 'ENTRYPOINT_FILE' packages/oxlint-plugins/effect-entrypoint/src/rules/*.config.ts` returns exactly the three filename-gated configs and never entrypoint-not-imported; `grep -c \"'entrypoint'\" packages/oxlint-plugins/cell-taxonomy/src/rules/cell-suffix-required.config.ts` returns 0"

- id: EP2
  title: The exemption is closed by content, not by name
  do: keep `entrypoint-no-exports` and `entrypoint-not-imported` enabled together — the two MUST stay enabled as a pair
  dont: relax either one to let a package expose bindings from `main.ts`
  harm: cell-taxonomy exempts `main.ts` from needing a cell suffix, so any behavior parked there escapes every cell rule at once — the two rules are what make the exemption cost more than naming the file correctly
  check: "`pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — entrypoint-no-exports keeps Should_Report_When_EntrypointExportsAConst red and entrypoint-not-imported keeps Should_Report_When_BarrelImportsTheEntrypoint red"

- id: EP3
  title: entrypoint-interprets-once is this package's OX-OB1 obligation
  do: keep its `missingEdge` report firing on absence
  dont: reduce this package to prohibitions
  harm: with prohibitions alone an empty `main.ts` passes every rule, and the gate collapses into a naming convention
  check: "`pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — entrypoint-interprets-once keeps its missingEdge cases red (Should_Report_When_EntrypointInterpretsNothing, Should_Report_When_EntrypointOnlyCallsANonEdgeEffectMethod)"

- id: EP4
  title: The two-edges trap is gated only in its direct syntactic form
  do: report `runMain(Effect.tryPromise(...))` and `runMain(Effect.promise(...))`
  dont: extend the rule to guess whether an imported function builds its own ManagedRuntime
  harm: a second runtime constructed behind an import is not statically visible; a heuristic would report on call-shape alone and train authors to disable the rule
  check: "`pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — entrypoint-no-promise-wrapper keeps Should_Pass_When_TheArgumentCallsANestedNamespace and Should_Pass_When_TheArgumentIsAComputedEffectMember valid and Should_Report_When_RunMainWrapsATryPromise red"

- id: EP5
  title: entrypoint-not-imported runs on every file
  do: leave it ungated by filename — the violation lives in the importer, not the entrypoint
  dont: add a test-file or tooling exemption
  harm: a test importing `main.ts` is the same defect as production importing it, and is how an entrypoint silently becomes a module
  check: `grep -n 'filename' packages/oxlint-plugins/effect-entrypoint/src/rules/entrypoint-not-imported.ts` returns nothing — the rule's create() is ungated — and `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` keeps Should_Report_When_ATestImportsTheEntrypoint red
```
