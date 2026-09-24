## 0.4.0

### Minor Changes

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

- Cases now run on the simulation kernel — the zero-preemption schedule, then the profile's seeded schedules — instead of always on the live clock, and each case draws its own crypto-random salt, so two cases never share a trace id.

  - `Suite.make({ it, layer })` → `Suite.make({ it })`.
  - A case that must stay live declares a reason on any stage: `.live('...')`, or the new `Suite.live` combinator (`self.pipe(Suite.live(reason))`).
  - `withLayer(shared)` rebuilds the shared layer freshly for every case rather than once per suite.
  - `Stimulus.traceContext` draws its ids through Effect's `Random`, so a seeded run replays the same trace ids.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-spec-runtime@0.3.0
