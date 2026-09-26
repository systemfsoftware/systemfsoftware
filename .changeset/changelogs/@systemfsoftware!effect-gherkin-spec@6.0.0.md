## 6.0.0

### Major Changes

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

- Live cases now declare a required reason, and every other scenario runs on the simulation kernel under the profile's seeded schedules.

  - `Feature('...').liveClock()` → `Feature('...').live('the reason it waits on real I/O')`, at every builder stage.
  - `FeatureLayerOptions` is gone: `withLayer(shared, opts)` → `withLayer(shared)`.
  - `makeFeature` takes bindings with only `it`: `makeFeature({ it, layer })` → `makeFeature({ it })`.
  - One scenario or outline stays live through its own options: `scenario('...', { live: 'why it needs the real clock' }, pipeline)`, where `live` is a reason string, not a boolean.

  The package re-exports only `it` and `layer` from `@effect/vitest`; import anything else from `@effect/vitest` directly.

### Minor Changes

- `StepError` now has a message naming the keyword, the resolved step text and a summary of the cause, for example `Given "a user logs in" failed: Unauthorized {"user":"bob"}`, and its stack leads with the spec line that wrote the step. Steps are recorded as spans, so a failing scenario reports which steps passed and which failed.

- `Then`, `And` and `But` bodies take `(state, expect)` and return exactly one check (or an Effect of one); `expect` is no longer imported from `@effect/vitest`. Only `Given` and `When` open a new observed state, so a `Then` followed by an `And` or `But` on the same state is refused: merge the facts into one `Then` over a record. `Then.soft`, `Then.poll` and `When.poll`, with their `And`/`But` forms, are removed, as are `checkSoftFailures`, `owned` and `recordAssertion`. A background pipeline may carry the check service.

### Patch Changes

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.

- Updated dependencies:
  - @systemfsoftware/vitest@0.2.0
