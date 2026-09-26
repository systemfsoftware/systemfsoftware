## 4.0.0

### Major Changes

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

### Patch Changes

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.

- Updated dependencies:
  - @systemfsoftware/vitest@0.2.0
