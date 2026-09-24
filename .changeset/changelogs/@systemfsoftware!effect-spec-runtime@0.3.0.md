## 0.3.0

### Minor Changes

- The lawful test runner is now a peer dependency under its own name, `@systemfsoftware/vitest`, instead of the `@effect/vitest` alias that pointed at it. Install `@systemfsoftware/vitest` and import `it`, `layer`, `expect`, and the rest from `@systemfsoftware/vitest`. `@systemfsoftware/effect-gherkin-spec` re-exports `it` and `layer` from `@systemfsoftware/vitest`.

- Cases now run on the simulation kernel: a case's layers build under the zero-preemption schedule, then the body runs under the profile's seeded schedules, and a case that must stay on the live clock declares a reason.

  - `Suite.Bindings` takes only `it`: drop the `layer` helper from the bindings you pass.
  - `Config.liveClock` becomes `Config.live`: `liveClock: true` → `live: { reason: '...' }`; `liveClock: false` → omit `live`.
  - `Suite.LayerOptions` and `Shared.excludeTestServices` are gone: `Shared` is `{ layer }`, and the registrar takes an optional fourth `live` argument.
  - Explored cases have no wall-clock timeout; a run is bounded in kernel steps, and a hang reports as a deadlock, a runaway, or a wait the kernel cannot observe.

  `KernelCase` is a new barrel exporting `caseProgram`, `liveCase`, `explore`, `announceLive`, and the `LiveCase` reason type.

### Patch Changes

- Kernel-explored cases now run as Effect tests, and the checks inside their steps count as assertions of the test they run in.

- Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

  `@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

  `@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.
