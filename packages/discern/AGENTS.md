# AGENTS.md — `@systemfsoftware/discern`

Semantic pattern matching and control flow over Effect's `DecisionModel`. Root `AGENTS.md` governs; this leaf carries only the delta.

## Fork provenance

Forked from [`doeixd/discern`](https://github.com/doeixd/discern) at commit `ab092e2656d5cb116653e846d3f42c4343bfbdf3`, then rewritten module by module into the cell taxonomy (`docs/plans/2026-09-23-1600-refactor-discern-cell-architecture-plan.md`). Owned outright (`REPO-O1`): upstream is a reference for reading, never a merge source.

## Rules

| ID     | Rule                                                                                                                                                                                                                                                                                                                                               | Gate                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | One entry, `.` (`src/mod.ts`), exporting the single `Discern` namespace; `Model`, `Eval` and `Procedure` are members of it, never separate entries or root barrels (`compound-packs/cell-architecture/single-namespace-barrel.md`).                                                                                                                | `pnpm --filter @systemfsoftware/discern build` exits 0 and `etc/` holds exactly `discern.api.md`, whose only root export is `namespace Discern`                                       |
| **D2** | Replay, caching, recording and budgets bind at the caller's edge by providing a `Discern.Model` layer; no policy, matcher or registry calls `Effect.provide` on the caller's behalf (`service-and-layer-boundaries.md` §3). The one sanctioned `provideService` is `CurrentDepth` around a routed member's run, which implements per-branch depth. | `review` — `Effect.provide(` and `Layer.provide` appear nowhere in `src/`; `provideService` only in `procedure-depth.service.ts`, `region.service.ts`, and `invoke-procedure.cell.ts` |
| **D3** | `oxlint.config.ts` is `extends: [recommended]` and nothing else: no `rules`, no `overrides`, no ignore patterns. A finding is fixed in the code.                                                                                                                                                                                                   | `pnpm --filter @systemfsoftware/discern lint` exits 0; `review` confirms the config has no keys beyond `extends`                                                                      |
| **D4** | The provider sees decisions keyed by content address (`hash`/`decisionFingerprint` in `decision-model.resource.ts`), never by the caller's `id`. Changing either canonical form changes every recording and cache key already stored.                                                                                                              | `tests/caching-and-budgets.integration.test.ts` and `tests/recording-and-replay.integration.test.ts` pass                                                                             |

Review pair for **D3** — wrong: adding `rules: { complexity: 'off' }` because a matcher combinator has four branches. Right: splitting the branches into a `Match.value` dispatch or a sibling workflow so each function stays at the preset's complexity ceiling.

## Verification

```bash
pnpm --filter @systemfsoftware/discern typecheck
pnpm --filter @systemfsoftware/discern lint
pnpm --filter @systemfsoftware/discern build
pnpm --filter @systemfsoftware/discern test
pnpm --filter @systemfsoftware/discern test:types
pnpm --filter @systemfsoftware/discern attw
```
