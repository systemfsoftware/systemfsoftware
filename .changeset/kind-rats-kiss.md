---
"@systemfsoftware/effect-gherkin-spec": major
---

Live cases now declare a required reason, and every other scenario runs on the simulation kernel under the profile's seeded schedules.

- `Feature('...').liveClock()` → `Feature('...').live('the reason it waits on real I/O')`, at every builder stage.
- `FeatureLayerOptions` is gone: `withLayer(shared, opts)` → `withLayer(shared)`.
- `makeFeature` takes bindings with only `it`: `makeFeature({ it, layer })` → `makeFeature({ it })`.
- One scenario or outline stays live through its own options: `scenario('...', { live: 'why it needs the real clock' }, pipeline)`, where `live` is a reason string, not a boolean.

The package re-exports only `it` and `layer` from `@effect/vitest`; import anything else from `@effect/vitest` directly.
