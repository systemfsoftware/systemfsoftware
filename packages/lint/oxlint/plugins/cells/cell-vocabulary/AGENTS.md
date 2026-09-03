# AGENTS.md — `@systemfsoftware/oxlint-plugin-cell-vocabulary`

Rule vocabulary is read off `Cell.vocabulary` at load, not declared here; not keyed to a cell. Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. Root `AGENTS.md` governs.

## Rules

| ID          | Rule                                                                                                                                                                                                                                                                                              | Gate                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CELL-V1** | Phase names, kinds, order, description module name, and I/O classification are module-load projections of `Cell.vocabulary`; never restated as literals in `src/` or fixtures. Dependency edge is exactly `@systemfsoftware/oxlint-plugin-cell-vocabulary -> @systemfsoftware/effect-cell-types`. | `grep -nE "'(read\|decode\|decide\|encode\|write\|pure\|impure\|store\|adapter)'" src/` returns nothing but `DESCRIPTION_NAMESPACE`                        |
| **CELL-V2** | An empty walked pure-phase set throws at load; never a default, `??`, or early `return` that lets the rule load with nothing to decide.                                                                                                                                                           | Emptying the partition makes `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test` exit 1 with `the walked vocabulary reports no pure phase` |
| **CELL-V3** | Message wording states the predicate's exact reach ("module-level helper"); never claims closure-captured bindings or nested closures are followed.                                                                                                                                               | `review` — each clause of `IO_IN_PHASE_BODY_EXPECTED` names a shape a fixture exercises                                                                    |
| **CELL-V4** | OX-OB1 does not apply — prohibitions only, no obligation rule (the description-requirement obligation is recorded unowned in `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md`).                                                                                        | `review` — `configs.recommended` registers prohibitions only                                                                                               |
| **CELL-D1** | Delivered consumer-side through each consuming package's own `jsPlugins` (OX-DL1); never through `oxlint-config`/`effect-dmmf`.                                                                                                                                                                   | `review`                                                                                                                                                   |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary lint
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary api:check
```
