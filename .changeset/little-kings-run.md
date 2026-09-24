---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

The recommended config sanctions the `*.conformance.test.ts` lane and enables two new rules at `error`.

- `conformance-test-requires-harness`: a `*.conformance.test.ts` file must import `Conformance` from `@systemfsoftware/conformance-spec` and call `Conformance.linearizable`, `Conformance.sequential`, or `Conformance.released`; raw runner calls and the retired `Linearizable.check`, `SequentialModel.check`, and `Released.check` shapes are reported.
- `model-fixture-imports-subject`: a `*.model.ts` fixture may not import the package whose tests it serves, nor relative-import outside its tests tree.
- `differential-test-requires-harness` now prescribes `Differential.compare({ name, reference, candidate })` and `Metamorphic.on({ name, system })`.
