# AGENTS.md — `effect-entrypoint/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate `main.ts` as a real interpretation edge. The spec of record is `skill://design-effect-entrypoint`; read it for which primitive an entrypoint should use. Restating it here would create a second copy that drifts.

```yaml
- id: EP1
  title: Keyed on a filename, not a cell suffix
  do: gate the exact basename `main.ts`
  dont: add `entrypoint` to the cell-taxonomy CELLS list or invent a `.entrypoint.ts` suffix
  harm: `main.ts` is one of cell-taxonomy's EXEMPT names (`CT1`); making it a cell would give the same file two owners
  check: every rule file matches on ENTRYPOINT_FILE, and cell-taxonomy's CELLS list is unchanged

- id: EP2
  title: The exemption is closed by content, not by name
  do: keep `entrypoint-no-exports` and `entrypoint-not-imported` enabled together
  dont: relax either one to let a package expose bindings from `main.ts`
  harm: cell-taxonomy exempts `main.ts` from needing a cell suffix, so any behavior parked there escapes every cell rule at once — the two rules are what make the exemption cost more than naming the file correctly
  check: a `main.ts` that exports anything, or that any module imports, is red

- id: EP3
  title: entrypoint-interprets-once is this package's OX-OB1 obligation
  do: keep its `missingEdge` report firing on absence
  dont: reduce this package to prohibitions
  harm: with prohibitions alone an empty `main.ts` passes every rule, and the gate collapses into a naming convention
  check: a `main.ts` containing no interpretation edge is red

- id: EP4
  title: The two-edges trap is gated only in its direct syntactic form
  do: report `runMain(Effect.tryPromise(...))` and `runMain(Effect.promise(...))`
  dont: extend the rule to guess whether an imported function builds its own ManagedRuntime
  harm: a second runtime constructed behind an import is not statically visible; a heuristic would report on call-shape alone and train authors to disable the rule
  check: entrypoint-no-promise-wrapper reports only when the argument is a direct Effect.promise/Effect.tryPromise call

- id: EP5
  title: entrypoint-not-imported runs on every file
  do: leave it ungated by filename — the violation lives in the importer, not the entrypoint
  dont: add a test-file or tooling exemption
  harm: a test importing `main.ts` is the same defect as production importing it, and is how an entrypoint silently becomes a module
  check: its create() has no filename guard, and a *.test.ts importing ./main.js is red
```
