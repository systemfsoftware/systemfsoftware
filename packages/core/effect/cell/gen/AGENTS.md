# AGENTS.md — `@systemfsoftware/effect-cell-gen`

> **Delta**: The property-test generator for Cell specs — a derived consumer that lives in its own package, importing `Cell` from `@systemfsoftware/effect-cell-types` and never the other way around. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-A1
    title: One derived consumer, dependency pointing one way
    do:
      - keep the runtime to the single generator `Gen.specCase` that builds
        specs by substituting drawn `run`s into the walked vocabulary
        and the `Bag`/`SpecCase` types it is parameterised on
      - keep the dependency edge exactly
        `@systemfsoftware/effect-cell-gen -> @systemfsoftware/effect-cell-types`;
        this package imports `Cell` from there and nothing there may import this package
      - move any further derived consumer (an observer, a lint rule, a documenter) into
        its own package on the same one-way edge
    dont: add `@systemfsoftware/effect-cell-types` (or any package that depends on this
      one, or on a lint plugin) to this package's `dependencies`, or move the generator
      back into `effect-cell-types`
    harm: "`packages/oxlint-config` declares every lint plugin as a real dependency, so a
      back-edge from `effect-cell-types` to this package — or from this package to any
      linted package that itself depends on `effect-cell-types` — closes a turbo
      `#build` cycle the repo fails on. The generator is a sibling of the interpreter by
      design: the description is the contract, and each consumer walks it for itself"
    check: "`pnpm turbo build --dry > /dev/null` reports no `Cyclic dependency detected`,
      and `grep -rn \"effect-cell-gen\" packages/effect-cell-types` returns nothing"

  - id: CELL-A2
    title: The five axes come from walking the vocabulary, never from literals
    do:
      - obtain the phase names, kinds, their declared order, the description package's
        module name, and the I/O-cell classification by walking `Cell.vocabulary` —
        `Cell.vocabulary.phases` for the phase records and the same object for the root fields
      - keep the convention switch exhaustive over `convention` with a `never` default,
        so a phase the interpreter does not know fails to compile here too
    harm: the description is the single place a phase is described; a generator that
      declares its own copy drifts from the interpreter it feeds, and a drift makes the
      properties pass over phases the interpreter never runs
    check: review — whether any phase name, kind, I/O cell, I/O source, or stage-brand
      sentence appears as a literal anywhere in this package; the reviewer greps
      `src/Gen.ts` for them and confirms the only axis named is the description
      module's own import

  - id: CELL-A3
    title: The properties read their expectations off the generated value
    do:
      - assert refutable claims about `Cell.run` over generated specs — phase
        execution order equals the order the drawn value declares, and the response is
        the write's; equivalence of drawn Cell vs chain-assembled Cell holds for trace,
        declared order, response, and failure routing
      - read every expectation off the drawn spec value, never off a restated constant;
        substitute phase bodies `yield*` a fresh `TraceRecorder` layer per property, no closure-captured arrays
      - the interpreter properties (6) live in the in-source block in `src/Gen.ts`; the
        decide property lives in `src/__tests__/DrawnDecision.workflow.property.test.ts`
      - "`Cell.vocabulary`: the generator rebuilds the spec from the walked
        vocabulary, so comparing the trace to the generator's own input would be
        circular"

## Verification

No mutation gate — see CELL-T1 of `@systemfsoftware/effect-cell-types`; this package
holds one `*.workflow.ts` (DrawnDecision) and a `Recorder.ts` service. The generator is verified by:
```
