# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Type-only contract for `*.workflow.ts` cells — `Workflow<Command, Decision, Error>` plus its two `never`-channel markers. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-T1
    title: Type-only — no runtime values, no mutation gate
    do: keep the package free of runtime exports
    dont: add runtime helpers, a stryker config, or a mutation script
    harm: there is no behavior to mutate, so a gate here certifies nothing
    check: package.json has no mutation script; src/ declares only types

  - id: CELL-T2
    title: No test file — the type is the contract
    do: state each claim about Workflow as an exported Holds alias in
      src/workflow-contract.kernel.ts; a false claim fails the build
    dont: add a test file, runtime assertions, it.prop, or fast-check
    harm: a behavioural test can pass while the public type silently widens
    check: pnpm --filter @systemfsoftware/effect-cell-types typecheck
```

## Verification

No mutation gate — see CELL-T1. The contract is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
```
