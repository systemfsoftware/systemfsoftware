# AGENTS.md — `@systemfsoftware/effect-cell-types`

> **Delta**: Contracts for the cell types other packages build against — `Workflow<Command, Decision, Error>` with its two `never`-channel markers and its `make`, the `Cell` spine (`Cell.layer` one-sandwich constructor, the `map`/`mapInput`/`andThen`/`zip`/`provide`/`withPolicy` arrows, `Cell.run`), and `Policy`. Root AGENTS.md governs.

## What makes this package different

````yaml
rules:
  - id: CELL-T1
    title: A type surface and one inline interpreter, no mutation gate
    do: keep the runtime to `Cell.layer`, the six arrows, `Cell.run`, and
      `layerRunner` — the gen in `Cell.ts` that is the interpreter
    dont: add a stryker config or a mutation script to this package, or publish
      any phase machinery (spec-shape types beyond `layer`'s parameters, phase
      constructors, description records) from the public surface
    harm: a mutation score measures whether the tests notice a changed decision,
      and this package holds no decision to change — every source file is a
      contract module whose content is types plus the one function that
      interprets them, so a surviving mutant here reports on the test suite of
      something else
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
        and assert what failed, what reached the write, and what came back
    dont: let a behavioural test stand in for a type assertion, or unit-test
      `layerRunner` in isolation — it decides nothing the Cell's type does not
      already carry
    harm: the channel unions are this package's whole claim and they live in the
      types, so a green behavioural run over a widened type proves nothing about
      what the compiler now accepts; equally, `layerRunner` is the one place a
      spec becomes effects, so only the outcome tests can catch a skipped phase
    check: "`pnpm --filter @systemfsoftware/effect-cell-types test:types` exits 0,
      and `pnpm --filter @systemfsoftware/effect-cell-types test` exits 0 with at
      least one Cell run end to end"

  - id: CELL-T3
    title: Order is the interpreter's text; the vocabulary is a const table
    do:
      - keep phase order in `layerRunner`'s body — read, decode, decide, encode,
        write, in that text, with no phase array, convention tag, or switch
      - keep `vocabulary` a const table stating only what a rule cannot read off
        a type: which phases are pure, and what counts as I/O
    dont: rebuild a description object at runtime so a generator or plugin can
      re-walk it, move order into data a fold switches on, or import a consumer
      — no package that reads this value may appear in this package's
      dependencies
    harm: a data-driven fold turns order into something fixtures measure instead
      of something the compiler holds, and the measuring fixture becomes a test
      spy wearing a service; a re-walkable description exists only to feed that
      spy
    check: review — `src/` contains no `phases` assembler and no canonical Cell;
      `vocabulary` is a literal whose every field a lint rule reads

  - id: CELL-T4
    title: Observation is a local closure, never a service on R
    do:
      - assert order once, in `tests/interpreter.integration.test.ts`, over a
        local `trace: string[]` the phase closures push to
      - assert outcomes through domain I/O — a `Ledger` the write appends to —
        or through the write's own response
    dont: put a test double on the requirements channel (`yield*` a recorder
      Tag), quantify order as a for-all property over fixed names, or share a
      mutable buffer between two fixture Cells to observe composition
    harm: a spy on `R` makes the suite prove the fixture called itself — a
      correct interpreter plus a fixture that forgets to record fails, while a
      broken one that calls an instrumented stub passes; the oracle becomes the
      spy, not the interpreter
    check: review — `grep -rn "TraceRecorder\|recordSync" packages/core/effect/cell/types/src
      test-types tests` returns nothing, and the order assertion is one scenario
      with a file-local array

## Verification

No mutation gate — see CELL-T1. The contract is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-types typecheck
pnpm --filter @systemfsoftware/effect-cell-types test:types
pnpm --filter @systemfsoftware/effect-cell-types test
pnpm --filter @systemfsoftware/effect-cell-types lint
pnpm --filter @systemfsoftware/effect-cell-types api:check
pnpm --filter @systemfsoftware/effect-cell-types attw
````
