## 0.1.0

### Minor Changes

- Kernel runs in one process queue behind each other in arrival order instead of refusing a second run that starts while one is live. New `Kernel.isStepping()` returns true only while the kernel is executing a step of a run.

- New package: a deterministic simulation kernel for Effect v4. `Kernel.run(program, options)` runs any Effect program under a schedule you control and returns its `Exit`, the decisions the schedule took, and a record of which fiber ran at every step. A failed run names why: `Escape` (the program reached a real timer), `Blocked` (it waits on a file or socket outside the process), `Deadlock` (nothing can wake a suspended fiber; every suspended fiber is listed with its frames), or `Runaway`. Replay a run exactly with `path`, steer it with `choose`, and interrupt a fiber at a chosen step with `interrupt`. `external: 'await'` waits for real file and socket I/O on Effect's own order. `Kernel.search`, `Kernel.pct` and `Kernel.shrink` explore schedules up to a stated preemption bound and budget, and shrink a failing schedule to its smallest form. `Kernel.TestClock.layer` stands in for Effect's `TestClock`, so `TestClock.adjust` and `setTime` move the kernel's virtual time. Only one kernel run can be active at a time, and a second one started beside it is refused.

  A runtime the program starts for itself during a run (`Effect.runFork` or `Effect.runPromise` with no scheduler of its own) runs under the same schedule and virtual clock, and a runtime started after the run finishes runs on the host again.

- New `local` conformance profile (`CONFORMANCE_PROFILE=local`): seeded runs use `Kernel.localSeeds` (25) instead of 250, and `Kernel.preemptionsFor` / `Kernel.currentPreemptionsFor` cap a search's preemption bound at `Kernel.localPreemptions` (1). An unset profile is still `per-change`, and `Kernel.search` itself is never capped.

- Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

  `@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

  `@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.
