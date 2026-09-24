---
"@systemfsoftware/differential-spec": minor
---

Every comparison now runs on the simulation kernel and each one carries its own test name. `Differential.compare` and `Metamorphic.on` take a single options object:

- `Differential.compare({ reference, candidate })` → `Differential.compare({ name, reference, candidate })`
- `Metamorphic.on(system)` → `Metamorphic.on({ name, system })`
- `runDual` is no longer exported; where you used it, inline `Effect.all([Effect.exit(targetA), Effect.exit(targetB)])`.
- `interruptAfterTimeLimit` is gone from the `.on(arbitrary, options)` options; drop it. A check is bounded by `runBudget` and by the kernel's step bound on each run, so a busy machine no longer turns a passing check into an inconclusive failure.

The kernel explores the two sides' interleavings and shrinks a disagreement against the schedule that produced it, so a failure report names the schedule. `@systemfsoftware/effect-sim-kernel` is now a runtime dependency.

Asynchronous targets still work when they wait on Effect's own clock or on promises that settle without host I/O: `Effect.sleep` advances virtual time, so it costs no wall-clock time. A target that waits on a real timer, file, or socket now fails the comparison with an `Escape` or `Blocked` report naming the wait, instead of running on the live clock.
