## 0.2.0

### Minor Changes

- Tests take `expect` from the test callback and yield each check: `it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) })`. The package stops exporting `expect`, `assert` and the `utils` helpers. With its `guard` entry listed in `setupFiles`, an `expect` imported from Vitest, or a test registered through Vitest's own `it`, is refused. Also refused, each with its rewrite as the message: a second check on one observed state, an unyielded check, a body with no check, a non-generator body, `it.effect`/`it.scoped`/`it.scopedLive`, `beforeEach`/`afterEach`, and weak matchers such as `toHaveLength`, `toBeDefined`, snapshots, `expect.anything`, `expect.soft`/`expect.poll` and argument-less `toThrow`. Libraries that judge inside a test import `step`, `captureRunBinding` and the `Check`/`Expect`/`Asserted` types from the `integration` entry.

- `@systemfsoftware/differential-spec` depends on and imports `@systemfsoftware/vitest` by its own name instead of through an `@effect/vitest` alias. `@systemfsoftware/oxlint-config-recommended` enables the test-discipline rule under its new id `vitest-from-systemfsoftware-vitest`. `@systemfsoftware/vitest` documentation examples import from `@systemfsoftware/vitest`.

  The lawful runner is published under its own name, `@systemfsoftware/vitest`, starting at `0.1.0`, so peers declared as `^0.1.0` accept its patch releases.

- A failing test now reports one failure record instead of a raw cause: the error with its message, the first source line outside the spec libraries, the steps that ran and the cell decisions each caused, and a rerun command for that one scenario. Every cause in the chain keeps all lines of its message. A replay value is printed only for a run a seed or a property chose. Each failure prints once; other errors in the same cause are logged. A failed `expect` points at the line that called it and a property failure at the line that declared it. A new `@systemfsoftware/vitest/failure` entry exports the renderer, the recorder, the cause summary (`summaryOf`) and the author call-site capture (`callSite`, `callFrameOutside`, `withRaisingFrame`) for libraries that raise their own failures.

- Kernel runs are serialized. A run started while another is live now waits behind it, in arrival order, instead of failing: two runs never interleave, so a scenario never sees another run's decisions, and a suite whose cases drive the kernel can run its tests concurrently.

  `@systemfsoftware/vitest` adds `captureRunBinding`, the running test's run binding. `bind(effect)` re-provides it to an effect a library runs on a runtime of its own — its own scheduler, a worker, a simulation kernel — so the checks inside it count as that test's assertions, report softly, and see the same `owned` regions.

  `@systemfsoftware/effect-spec-runtime` runs a case that declares no live reason through that runner, and a case's annotations now reach the test's report.
