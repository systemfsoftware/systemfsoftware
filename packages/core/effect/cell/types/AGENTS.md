# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Contracts for the cell types other packages build against — `Workflow<Command, Decision, Error>` with its two `never`-channel markers and its `make`, the `Cell` spine (`Cell.layer` one-sandwich constructor, the `map`/`mapInput`/`andThen`/`zip`/`provide`/`withPolicy` arrows, `Cell.run`), and `Policy`. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-T1
    title: A type surface and one internal interpreter, no mutation gate
    do: keep the runtime to `Cell.layer`, the six arrows, `Cell.run`, and the
      assembler in `src/internal/` that folds a description and runs it
    dont: add a stryker config or a mutation script to this package, or publish
      any of the bag machinery (`Phases`, the phase types, the `*Done` markers,
      `Description`, `fold`) from the public surface
    harm: a mutation score measures whether the tests notice a changed decision,
      and this package holds no decision to change — every source file is a
      contract module whose content is types plus the fold that interprets them,
      so a surviving mutant here reports on the test suite of something else
    check: "`git ls-files packages/core/effect/cell/types` names no `stryker.config.json`,
      and `package.json` carries no mutation script; `'apply' extends keyof typeof Cell`
      stays false in `test-types/Cell.tst.ts`"

  - id: CELL-T2
    title: The type observer is mandatory; composition covers the interpreter
    do:
      - state every claim about the Cell surface — layer's two spec forms, the
        inferred error and service channels, the combinators' unions, provide's
        narrowing — as an assertion in `test-types/*.tst.ts`, run by tstyche
      - verify `Cell.run` with composition tests in `tests/` that run a real Cell
        and assert which phases ran, in what order, and what reached the write
    dont: let a behavioural test stand in for a type assertion, or unit-test the
      assembler in isolation — it decides nothing the Cell's type does not
      already carry
    harm: the channel unions are this package's whole claim and they live in the
      types, so a green behavioural run over a widened type proves nothing about
      what the compiler now accepts; equally, `fold` is the one place a spec
      becomes effects, so a step that drops a phase or runs one twice is
      invisible to every type assertion
    check: "`pnpm --filter @systemfsoftware/effect-cell-types test:types` exits 0,
      and `pnpm --filter @systemfsoftware/effect-cell-types test` exits 0 with at
      least one Cell run end to end"

  - id: CELL-T3
    title: This package is where a phase is described, and the only place
    do:
      - "author a new phase here and nowhere else: its node record, its convention,
        its place in the assembler's chain, and its place in `canonical`"
      - let `vocabulary` stay a fold of the canonical Cell's description, so the
        table is a walk result rather than a second declaration standing beside
        the assembler
    dont: hand-write a phase table, duplicate an axis into a constant beside the
      assembler, or import a consumer — no package that walks this value may
      appear in this package's dependencies
    harm: every derived consumer — the arbitrary and both lint plugins —
      takes its whole behaviour from this value. A second declaration
      here is the one edit that can make them all wrong at once while every one of
      them still passes, because they would agree with each other and disagree only
      with the assembler
    check: review — adding a phase in `src/internal/phases.ts` propagates cleanly to consumers under `pnpm check:local`; only this package's own golden and type spec fail until updated

  - id: CELL-T4
    title: The integration oracle restates the vocabulary on purpose
    do: keep the hand-written phase list in
      `tests/interpreter.integration.test.ts` — it is an independent oracle,
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
