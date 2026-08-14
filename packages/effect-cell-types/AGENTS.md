# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Contracts for the cell types other packages build against — `Workflow<Command, Decision, Error>` with its two `never`-channel markers and its `make`, the `Cell` phase types with their chaining constructors and the `apply` interpreter, and `Policy`. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-T1
    title: A type surface and one interpreter, no mutation gate
    do: keep the runtime to the phase constructors, the identity constructors, and
      the single interpreter `apply` that folds a description and runs it
    dont: add a stryker config or a mutation script to this package
    harm: mutation observes `*.workflow.ts` and this package holds none — every
      source file here is a PascalCase contract module, so any mutate glob would
      enroll a non-workflow cell, which `guard-mutate-scope` names a
      wrong-observer error and rejects
    check: `pnpm check:mutate-scope` — this package ships no stryker config, and
      package.json carries no mutation script

  - id: CELL-T2
    title: The type observer is mandatory; composition covers the interpreter
    do:
      - state every claim about the phase types, their order, and the published
        declaration as an assertion in `test-types/*.tst.ts`, run by tstyche — an
        order the types stop rejecting fails there first
      - verify `apply` with composition tests in `__tests__/` that run a real
        description and assert which phases ran, in what order, and what reached
        the write
    dont: let a behavioural test stand in for a type assertion, or unit-test a
      phase constructor in isolation — it decides nothing its return type does not
      already carry
    harm: the order is this package's whole claim and it lives in the types, so a
      green behavioural run over a widened type proves nothing about what the
      compiler now accepts; equally, the interpreter is the one place a
      description becomes effects, so a fold that drops a layer or runs a phase
      twice is invisible to every type assertion
    check: `pnpm --filter @systemfsoftware/effect-cell-types test:types` exits 0
      with each assertion observed failing once with its expect-error directive
      removed, and `test` exits 0 with at least one description run end to end
```

## Verification

No mutation gate — see CELL-T1. The contract is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types test:types
pnpm --filter @systemfsoftware/effect-cell-types test
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
pnpm --filter @systemfsoftware/effect-cell-types attw
```
