## 0.6.0

### Minor Changes

- A differential check that finds no disparity now counts as an assertion of the test it runs in, and a check whose property run was interrupted is reported as inconclusive instead of passing.

  `Differential.compare` and `Metamorphic.on` checks no longer carry a wall-clock test timeout: their work is bounded by runs and schedules, so a loaded machine cannot fail a correct check. A check whose side touches the host declares its own limit with the new `hostBound: { timeout, reason }` option, and the reason is shown on the test.

- A disparity now fails the check with `DisparityFailure`, whose message is the disparity report with the input, both outputs and the fast-check reproduction.

- Every comparison now runs on the simulation kernel and each one carries its own test name. `Differential.compare` and `Metamorphic.on` take a single options object:

  - `Differential.compare({ reference, candidate })` → `Differential.compare({ name, reference, candidate })`
  - `Metamorphic.on(system)` → `Metamorphic.on({ name, system })`
  - `runDual` is no longer exported; where you used it, inline `Effect.all([Effect.exit(targetA), Effect.exit(targetB)])`.
  - `interruptAfterTimeLimit` is gone from the `.on(arbitrary, options)` options; drop it. A check is bounded by `runBudget` and by the kernel's step bound on each run, so a busy machine no longer turns a passing check into an inconclusive failure.

  The kernel explores the two sides' interleavings and shrinks a disagreement against the schedule that produced it, so a failure report names the schedule. `@systemfsoftware/effect-sim-kernel` is now a runtime dependency.

  Asynchronous targets still work when they wait on Effect's own clock or on promises that settle without host I/O: `Effect.sleep` advances virtual time, so it costs no wall-clock time. A target that waits on a real timer, file, or socket now fails the comparison with an `Escape` or `Blocked` report naming the wait, instead of running on the live clock.

- `runDifferentialWithShrink` and `runMetamorphicWithShrink` take the test's `expect` (before `options`) and end in one check: a pass is the check holding, and a disparity or break fails it with the report. `DisparityError` is removed. `differentialReport` and `metamorphicReport` return the `{ holds, report }` value for callers that judge it themselves, and `reportCheck(expect)(report)` turns one into a check. `compare` and the metamorphic DSL register each comparison as a generator test, keeping the host-bound timeout and annotation.

### Patch Changes

- `@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/oxlint-config-recommended` enables the test-discipline rule under its new id `vitest-from-systemfsoftware-vitest`. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.

  The lawful runner is published under its own name, `@systemfsoftware/vitest`, starting at `0.1.0`, so peers declared as `^0.1.0` accept its patch releases.

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.

- Updated dependencies:
  - @systemfsoftware/effect-sim-kernel@0.2.0
  - @systemfsoftware/vitest@0.2.0
