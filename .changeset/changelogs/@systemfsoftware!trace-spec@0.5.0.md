## 0.5.0

### Minor Changes

- `Rel.Hold`, `Rel.Break` and `ObservationWindow.ObservationWindowSpec` are schema structs instead of classes, with unchanged encoded shapes: build them with `.make(...)` instead of `new`. The `VerdictTypeId` type is removed. `IncompleteObservationError.spanCount` must be a non-negative integer, and span `startMillis` and `durationMillis` must be finite and non-negative.

- `Contract.check(expect, input, options?)` takes the test's `expect` and ends in one check: a break fails it with the report as the message. `Contract.judge` returns the `{ verdict: 'Hold' | 'Break', report }` value, and `Contract.verdictCheck(contract, expect, judgment)` turns one into a check. `TraceDisparityError` is removed. `Suite` cases register as generator tests and judge each case once.

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

- A broken contract now fails the check with `BreakFailure`, whose message is the break report, pointing at the line that called the check.

- Cases now run on the simulation kernel — the zero-preemption schedule, then the profile's seeded schedules — instead of always on the live clock, and each case draws its own crypto-random salt, so two cases never share a trace id.

  - `Suite.make({ it, layer })` → `Suite.make({ it })`.
  - A case that must stay live declares a reason on any stage: `.live('...')`, or the new `Suite.live` combinator (`self.pipe(Suite.live(reason))`).
  - `withLayer(shared)` rebuilds the shared layer freshly for every case rather than once per suite.
  - `Stimulus.traceContext` draws its ids through Effect's `Random`, so a seeded run replays the same trace ids.

### Patch Changes

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.

- Updated dependencies:
  - @systemfsoftware/trace-taxonomy@0.0.2
  - @systemfsoftware/vitest@0.2.0
