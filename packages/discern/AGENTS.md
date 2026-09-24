# AGENTS.md — `@systemfsoftware/discern`

Semantic pattern matching and control flow over Effect's `DecisionModel`. Root `AGENTS.md` governs; this leaf carries only the delta.

## Fork provenance

Forked from [`doeixd/discern`](https://github.com/doeixd/discern) at commit `ab092e2656d5cb116653e846d3f42c4343bfbdf3`, then rewritten module by module into the cell taxonomy. Owned outright (`REPO-O1`) and sovereign: upstream carries no weight for any API, test or behaviour here, and is never a merge source. The conformance bar is `compound-packs/` with `packages/effect-microsandbox` as the exemplar.

## Rules

| ID     | Rule                                                                                                                                                                                                                                                                                                                                               | Gate                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | One entry, `.` (`src/mod.ts`), exporting the single `Discern` namespace; `Model`, `Eval` and `Procedure` are members of it, never separate entries or root barrels (`compound-packs/cell-architecture/single-namespace-barrel.md`).                                                                                                                | `pnpm --filter @systemfsoftware/discern build` exits 0 and `etc/` holds exactly `discern.api.md`, whose only root export is `namespace Discern`                                       |
| **D2** | Replay, caching, recording and budgets bind at the caller's edge by providing a `Discern.Model` layer; no policy, matcher or registry calls `Effect.provide` on the caller's behalf (`service-and-layer-boundaries.md` §3). The one sanctioned `provideService` is `CurrentDepth` around a routed member's run, which implements per-branch depth. | `review` — `Effect.provide(` and `Layer.provide` appear nowhere in `src/`; `provideService` only in `procedure-depth.service.ts`, `region.service.ts`, and `invoke-procedure.cell.ts` |
| **D3** | `oxlint.config.ts` is `extends: [recommended]` and nothing else: no `rules`, no `overrides`, no ignore patterns. A finding is fixed in the code.                                                                                                                                                                                                   | `pnpm --filter @systemfsoftware/discern lint` exits 0; `review` confirms the config has no keys beyond `extends`                                                                      |
| **D4** | The provider sees decisions keyed by content address (`hash`/`decisionFingerprint` in `decision-model.blueprint.ts`), never by the caller's `id`. Changing either canonical form changes every recording and cache key already stored.                                                                                                             | `tests/caching-and-budgets.integration.test.ts` and `tests/recording-and-replay.integration.test.ts` pass                                                                             |
| **D5** | No defect hides in `src/`: no `Effect.die`, `orDie`, `getOrThrow`, `throw`, or cast. An impossible case is made unrepresentable in the types, and a cell's `CommandRejected` fails typed with its read context and the rejection as `cause` (`packages/effect-microsandbox/src/await-readiness.cell.ts`).                                          | grep tool, pattern `Effect\.die\|orDie\|getOrThrow\|\bthrow\b\|as unknown\|@ts-expect-error`, path `packages/discern/src`, returns nothing                                            |
| **D6** | Handles (`*.handle.ts`) are minimal records: `TypeId`, data, and an opaque `MutableRef`, with no function fields; every operation is a standalone Effect-returning function (`packages/effect-microsandbox/src/running-vm.handle.ts`). Every public method on a resource record has a same-name standalone `dual`.                                 | `review` — `test-types/*.tst.ts` pin each method/dual pair                                                                                                                            |

Review pair for **D3** — wrong: adding `rules: { complexity: 'off' }` because a matcher combinator has four branches. Right: splitting the branches into a `Match.value` dispatch or a sibling workflow so each function stays at the preset's complexity ceiling.

Review pair for **D6**: wrong is `readonly spent: () => BudgetSpend` on `Budget`, or `node.is('x')` with no `Discern.is`. Right is `spent(budget): Effect<BudgetSpend>` over `readonly counters: MutableRef<BudgetSpend>`, and `node.pipe(Discern.is('x'))` compiling beside `node.is('x')`.

## Verification

```bash
pnpm --filter @systemfsoftware/discern typecheck
pnpm --filter @systemfsoftware/discern lint
pnpm --filter @systemfsoftware/discern build
pnpm --filter @systemfsoftware/discern test
pnpm --filter @systemfsoftware/discern test:types
pnpm --filter @systemfsoftware/discern attw
```
