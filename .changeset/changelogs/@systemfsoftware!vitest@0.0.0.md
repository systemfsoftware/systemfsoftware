## 0.0.0

### Minor Changes

- New `captureRunBinding`: an Effect that captures the running test's binding, so a testing library can run an effect elsewhere (e.g. inside a simulation kernel) and still have its `expect` calls counted as that test's assertions.

- `@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/oxlint-config-recommended` enables the test-discipline rule under its new id `vitest-from-systemfsoftware-vitest`. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.

  The lawful runner is published under its own name, `@systemfsoftware/vitest`, starting at `0.1.0`, so peers declared as `^0.1.0` accept its patch releases.

- Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

  `@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

  `@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.
