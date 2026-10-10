# AGENTS.md — `@systemfsoftware/differential-spec`

Differential and metamorphic testing for Effect programs: two implementations are compared with
`Differential.compare`, or one system with `Metamorphic.on`, and a failure shrinks to a minimal
counterexample. Root `AGENTS.md` governs.

## Rules

| ID    | Rule                                                                                                                                                                                                                                                                                  | Gate                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| DS-A1 | The mutated set is exactly `src/**/*.workflow.ts`. The package's decisions are `src/core/{judge-dual-exits,select-disagreement-attempt}.workflow.ts`; the shells that call them project facts and render, and are not mutated (KTD1, KTD2, KTD11 of the workflow-only mutation plan). | `grep -n mutate stryker.config.ts` |

## Verification

```bash
pnpm --filter @systemfsoftware/differential-spec lint
pnpm --filter @systemfsoftware/differential-spec typecheck
pnpm --filter @systemfsoftware/differential-spec test
```
