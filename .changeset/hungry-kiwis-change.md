---
"@systemfsoftware/differential-spec": minor
---

Every comparison now runs on the simulation kernel and each one carries its own test name. `Differential.compare` and `Metamorphic.on` take a single options object:

- `Differential.compare({ reference, candidate })` → `Differential.compare({ name, reference, candidate })`
- `Metamorphic.on(system)` → `Metamorphic.on({ name, system })`
- `runDual` is no longer exported; where you used it, inline `Effect.all([Effect.exit(targetA), Effect.exit(targetB)])`.

The kernel explores the two sides' interleavings and shrinks a disagreement against the schedule that produced it, so a failure report names the schedule. `@systemfsoftware/effect-sim-kernel` is now a runtime dependency.
