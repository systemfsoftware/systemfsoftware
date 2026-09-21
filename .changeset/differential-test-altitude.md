---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
---

New rule `differential-test-requires-harness` (recommended, error): a `.differential.test.ts` file must import and invoke `@systemfsoftware/differential-spec` (`Differential.compare` / `Metamorphic.on`) and must not call raw test runners. `test-suffix-outside-src` now sanctions the `.differential.test.ts` altitude alongside `.integration.test.ts`, and `property-file-purity` treats differential files as property files.
