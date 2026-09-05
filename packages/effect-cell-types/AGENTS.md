# AGENTS.md — `@systemfsoftware/effect-cell-types`

Contracts for the cell types other packages build against: `Workflow<Command, Decision, Error>` with its `make`, the `Cell` spine (`Cell.layer`, the combinator arrows, `Cell.run`), and `Policy`. Root `AGENTS.md` governs.

## Rules

| ID          | Rule                                                                                                                                                                                                                                                                                                                                            | Gate                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **CELL-T1** | The runtime stays limited to `Cell.layer`, the six arrows, `Cell.run`, and `layerRunner`. No `stryker.config.json`, no mutation script, no phase machinery in the public surface — this package holds types plus one interpreter, so a mutation score here reports on someone else's test suite.                                                | `git ls-files packages/effect-cell-types` names no `stryker.config.json`; `package.json` carries no mutation script              |
| **CELL-T2** | Every claim about the Cell surface is a type assertion in `test-types/*.tst.ts` (tstyche); `Cell.run` is verified by composition tests in `tests/` running a real Cell end to end. Never unit-test `layerRunner` in isolation or substitute a behavioural test for a type assertion.                                                            | `pnpm --filter @systemfsoftware/effect-cell-types test:types` and `pnpm --filter @systemfsoftware/effect-cell-types test` exit 0 |
| **CELL-T3** | Phase order is literal text in `layerRunner`'s body (read, decode, decide, encode, write) — no phase array, convention tag, or data-driven fold. `vocabulary` is a const table stating only what a rule cannot read off a type (which phases are pure, what counts as I/O). No consumer of `vocabulary` appears in this package's dependencies. | `review`                                                                                                                         |
| **CELL-T4** | Observation is a local closure, never a service on `R`.                                                                                                                                                                                                                                                                                         | `grep -rn "TraceRecorder\|recordSync" packages/effect-cell-types/src test-types tests` returns nothing                           |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types test:types
pnpm --filter @systemfsoftware/effect-cell-types test
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
pnpm --filter @systemfsoftware/effect-cell-types attw
```
