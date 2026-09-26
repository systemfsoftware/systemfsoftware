## 0.2.0

### Minor Changes

- The `nightly` profile is removed. `ProfileName` is now `'local' | 'per-change'`, and `CONFORMANCE_PROFILE=nightly` falls back to `per-change` (250 seeds) instead of deriving a seed count from a 1% miss rate. Callers passing `'nightly'` to `Kernel.seedsFor` no longer type-check.

- Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

  `@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

  `@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.

### Patch Changes

- Kernel.search enumerates each run's branches in linear time. It used to re-count a schedule's spent preemptions from the start of the run for every branch position, which cost about a fifth of a bounded search's time; the schedules explored are unchanged.
