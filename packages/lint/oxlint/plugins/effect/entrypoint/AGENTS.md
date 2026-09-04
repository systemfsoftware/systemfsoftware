# AGENTS.md — `@systemfsoftware/oxlint-plugin-effect-entrypoint`

Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. Rules gate `main.ts` as a real interpretation edge; spec of record: `skill://design-effect-entrypoint`.

## Rules

| ID      | Rule                                                                                                                                                                                          | Gate                                                                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EP1** | Key rules on the exact basename `main.ts`, never on a cell-role suffix or a sanctioned cell list.                                                                                             | `grep -l 'ENTRYPOINT_FILE' packages/lint/oxlint/plugins/effect/entrypoint/src/rules/*.config.ts` returns exactly the three filename-gated configs; `grep -rn 'entrypoint' packages/lint/oxlint/plugins/*/src --include='*.config.ts' \| grep -v effect-entrypoint` returns nothing |
| **EP2** | `entrypoint-no-exports` and `entrypoint-not-imported` stay enabled as a pair — never relax either to let a package expose bindings from `main.ts`.                                            | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — `Should_Report_When_EntrypointExportsAConst` and `Should_Report_When_BarrelImportsTheEntrypoint` stay red                                                                                          |
| **EP3** | `entrypoint-interprets-once` is this package's OX-OB1 obligation: its `missingEdge` report fires on absence.                                                                                  | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — `Should_Report_When_EntrypointInterpretsNothing` and `Should_Report_When_EntrypointOnlyCallsANonEdgeEffectMethod` stay red                                                                         |
| **EP4** | The two-edges trap is gated only in its direct syntactic form (`runMain(Effect.tryPromise(...))`, `runMain(Effect.promise(...))`); never extend it to guess what an imported function builds. | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test` exits 0 — the nested-namespace and computed-member cases stay valid, `Should_Report_When_RunMainWrapsATryPromise` stays red                                                                                  |
| **EP5** | `entrypoint-not-imported` runs on every file — the violation lives in the importer; no test-file or tooling exemption.                                                                        | `grep -n 'filename' packages/lint/oxlint/plugins/effect/entrypoint/src/rules/entrypoint-not-imported.ts` returns nothing; `Should_Report_When_ATestImportsTheEntrypoint` stays red                                                                                                 |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-entrypoint lint
```
