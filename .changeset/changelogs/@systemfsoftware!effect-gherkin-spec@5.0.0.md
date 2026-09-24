## 5.0.0

### Major Changes

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

- Live cases now declare a required reason, and every other scenario runs on the simulation kernel under the profile's seeded schedules.

  - `Feature('...').liveClock()` → `Feature('...').live('the reason it waits on real I/O')`, at every builder stage.
  - `FeatureLayerOptions` is gone: `withLayer(shared, opts)` → `withLayer(shared)`.
  - `makeFeature` takes bindings with only `it`: `makeFeature({ it, layer })` → `makeFeature({ it })`.
  - One scenario or outline stays live through its own options: `scenario('...', { live: 'why it needs the real clock' }, pipeline)`, where `live` is a reason string, not a boolean.

  The package re-exports only `it` and `layer` from `@effect/vitest`; import anything else from `@effect/vitest` directly.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-spec-runtime@0.3.0
