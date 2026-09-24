---
"@systemfsoftware/effect-sim-kernel": minor
"@systemfsoftware/vitest": minor
"@systemfsoftware/effect-spec-runtime": patch
---

Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

`@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

`@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.
