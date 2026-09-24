## 4.0.0

### Major Changes

- Rule `vitest-from-effect-vitest` is renamed `vitest-from-systemfsoftware-vitest`, and it now reports imports from upstream `@effect/vitest` as well as from raw `vitest`: test APIs come from `@systemfsoftware/vitest`. It also reports value re-exports (`export * from` / `export { … } from`) of either source; type-only re-exports stay legal. The Gherkin, differential, and conformance lane rules treat `@systemfsoftware/vitest` and upstream `@effect/vitest` as runner imports alongside `vitest`. Rename the rule id anywhere you configure it.

### Minor Changes

- The recommended config sanctions the `*.conformance.test.ts` lane and enables two new rules at `error`.

  - `conformance-test-requires-harness`: a `*.conformance.test.ts` file must import `Conformance` from `@systemfsoftware/conformance-spec` and call `Conformance.linearizable`, `Conformance.sequential`, or `Conformance.released`; raw runner calls and the retired `Linearizable.check`, `SequentialModel.check`, and `Released.check` shapes are reported.
  - `model-fixture-imports-subject`: a `*.model.ts` fixture may not import the package whose tests it serves, nor relative-import outside its tests tree.
  - `differential-test-requires-harness` now prescribes `Differential.compare({ name, reference, candidate })` and `Metamorphic.on({ name, system })`.

- Admit the lawful property shape and the runner lanes. `prop-generated-law-duplicate` treats a call to the `subject` parameter a property's `holds` predicate is handed as reaching the module's own code, so an `it.prop(name, { of, subject }, holds)` body that only calls the subject it was given is no longer reported as calling no function. `in-source-test-targets-private` accepts a module-level binding named in a property's `subject` field as an in-source test's target, whether or not that binding is exported. `pbt-naming` admits `⊨` as a relation symbol. `test-suffix-outside-src` and `damp-test-naming` no longer apply to the packages that drive Vitest's own runner or to tstyche `.tst.ts` type tests.

### Patch Changes

- `prop-generated-law-duplicate` and `in-source-test-targets-private` accept the lawful `it.prop(name, { of, subject }, holds)` form: the subject the predicate is handed counts as the code under test. `pbt-naming` accepts `⊨` (satisfies a declared model) as a relation, `damp-test-naming` skips type-test files, and `test-suffix-outside-src` leaves packages that drive the test runner itself to their plain test files.

- `behaviour-test-requires-gherkin` now tells authors to import `it` from `@systemfsoftware/effect-gherkin-spec` and build the suite with `makeFeature({ it })`, matching the current `makeFeature` signature.
