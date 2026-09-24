## 0.3.0

### Minor Changes

- Suite registrars take a scenario, `(expect) => Effect`, instead of a bare Effect, and each case registers as a generator test, so the check a case ends in comes from the test's own `expect`. Kernel-explored cases re-provide the test's check ledger through `captureRunBinding`, so every seeded replay is judged once.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/vitest@0.1.0
