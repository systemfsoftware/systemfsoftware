# AGENTS.md — `@systemfsoftware/effect-cell-gen`

> **Delta**: The property-test generator for Cell descriptions — a derived consumer that lives in its own package, importing `Cell` from `@systemfsoftware/effect-cell-types` and never the other way around. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-A1
    title: One derived consumer, dependency pointing one way
    do:
      - keep the runtime to the single generator `Gen.description` that builds
        descriptions by substituting drawn `run`s into the walked canonical
        description, and the `Bag`/`DescriptionCase` types it is parameterised on
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
    title: The five axes come from walking a description, never from literals
    do:
      - obtain the phase names, kinds, their declared order, the description package's
        module name, and the I/O-cell classification by walking description values —
        `Cell.canonical` (the description module's exported canonical description) for
        the phase records, and the same spread for the root fields, which the built
        value carries
      - keep the convention switch exhaustive over `convention` with a `never` default,
        so a phase the interpreter does not know fails to compile here too
    dont: restate any phase name, kind, order, module name, or I/O cell as a literal in
      this package, or read the axes from a constant instead of a value
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
      - assert refutable claims about `Cell.apply` over generated descriptions — phase
        execution order equals the order the drawn value declares, and the response is
        the write's
      - read every expectation off the drawn description value, never off
      - "`Cell.vocabulary`: the generator rebuilds the description from the walked
        canonical value, so comparing the trace to the generator's own input would be
        circular"
    dont: add a behavioural test that asserts the vocabulary's contents, or a test that
      compares the interpreter's trace against a literal phase list
    harm: the properties exist to catch an interpreter that reorders the declared phases,
      skips one, runs one twice, or returns something other than the write's response; a comparison against the
      generator's own input cannot catch any of those
    check: "`pnpm --filter @systemfsoftware/effect-cell-gen test` exits 0 with every
      property running — the interpreter properties in the in-source block in
      `src/Gen.ts`, the decide property in
      `src/__tests__/DrawnDecision.workflow.property.test.ts` — and the expectations read
      only the drawn value"
```

## Verification

No mutation gate — see CELL-T1 of `@systemfsoftware/effect-cell-types`; this package
holds no `*.workflow.ts` source either. The generator is verified by:

```bash
pnpm --filter @systemfsoftware/effect-cell-gen typecheck
pnpm --filter @systemfsoftware/effect-cell-gen test
pnpm --filter @systemfsoftware/effect-cell-gen lint
pnpm --filter @systemfsoftware/effect-cell-gen api:check
pnpm --filter @systemfsoftware/effect-cell-gen attw
```
