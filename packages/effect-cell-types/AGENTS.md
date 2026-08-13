# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Contract for `*.workflow.ts` cells — `Workflow<Command, Decision, Error>` plus its two `never`-channel markers and the `make` constructor that guards them. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-T1
    title: One identity constructor, no mutation gate
    do: keep runtime exports to the single identity constructor `make`; the value
      of truth is the `Workflow` type and its two `never`-channel markers
    dont: add runtime helpers, a stryker config, or a mutation script
    harm: the only runtime behavior is one identity cast — no decision, so no
      mutant worth catching; a gate here certifies nothing
    check: review — package.json carries no mutation or stryker script and src/
      declares the type surface plus `make`

  - id: CELL-T2
    title: The type observer, not a test suite
    do: state each claim about Workflow and `make` as an assertion in
      test-types/Workflow.tst.ts, run by tstyche; a false claim fails the run
    dont: add behavioural tests, runtime assertions, it.prop, or fast-check
    harm: a behavioural test can pass while the public type silently widens
    check: `pnpm --filter @systemfsoftware/effect-cell-types test:types` exits 0
```

## Verification

No mutation gate — see CELL-T1. The contract is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types test:types
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
```
