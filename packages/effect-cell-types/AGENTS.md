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
    harm: a mutation score measures whether the tests notice a changed decision,
      and this package holds no decision to change — every source file is a
      contract module whose content is types plus the fold that interprets them,
      so a surviving mutant here reports on the test suite of something else
    check: "`git ls-files packages/effect-cell-types` names no `stryker.config.json`,
      and `package.json` carries no mutation script"

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
    check: "`pnpm --filter @systemfsoftware/effect-cell-types test:types` exits 0
      with each assertion observed failing once with its expect-error directive
      removed, and `test` exits 0 with at least one description run end to end"

  - id: CELL-T3
    title: This package is where a phase is described, and the only place
    do:
      - "author a new phase here and nowhere else: its closure type, its node
        record, its union member, its stage brand, its constructor, and its place
        in `canonical` — the chain that only type-checks in one order"
      - let `vocabulary` stay a fold of `canonical`, a description the public
        constructors build, so the table is a walk result rather than a second
        declaration standing beside them
    dont: hand-write a phase table, duplicate an axis into a constant beside the
      constructors, or import a consumer — no package that walks this value may
      appear in this package's dependencies
    harm: every derived consumer — the arbitrary, the type-test generator, and both
      lint plugins — takes its whole behaviour from this value. A second declaration
      here is the one edit that can make them all wrong at once while every one of
      them still passes, because they would agree with each other and disagree only
      with the constructors
    check: review — adding a phase in `src/Cell.ts` propagates cleanly to consumers under `pnpm check:local`; only this package's own golden and type spec fail until updated
  - id: CELL-T4
    title: The integration oracle restates the vocabulary on purpose
    do: keep the hand-written phase list in
      `__tests__/interpreter.integration.test.ts` — it is an independent oracle,
      and its whole job is to disagree with the fold when the fold is wrong
    dont: derive it from `Cell.vocabulary`, and do not delete it as duplication
    harm: a derived checker validated only against fixtures the same walk produced
      cannot fail; the restatement is what makes the walk falsifiable, and it is
      inside this package precisely so a consumer never carries an axis literal
    check: review — the phase list in that file is written out, and the comment
      above it says why
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
