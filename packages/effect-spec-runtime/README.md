# @systemfsoftware/effect-spec-runtime

The registrar and kernel-case core behind Effect spec harnesses: every case runs under the simulation kernel by default (the zero-preemption schedule, then the profile's seeded schedules), a case that must stay on the live clock declares itself with a required reason, and a failure reports the seed and decision path that `CONFORMANCE_REPLAY` reproduces. `@systemfsoftware/effect-gherkin-spec` is built on it.

The package exports three namespace barrels:

```ts
import { KernelCase, Suite, TaskRef } from '@systemfsoftware/effect-spec-runtime'
```

## KernelCase

`KernelCase.caseProgram(body, env)` builds a case whose layers are rebuilt fresh around every run and whose body runs under the kernel's test clock; `KernelCase.liveCase(body, env, reason)` is the live-clock counterpart and announces the reason on the run report, so every live case is listed with why it stayed live.

## Suite

`Suite.open` registers a suite with no layer, `Suite.openShared` adds a layer shared by the whole suite, `Suite.openCase` adds a layer acquired fresh around every case, and `Suite.openSharedCase` does both:

````ts
Suite.openShared(bindings, config, { layer: DatabaseFixture, excludeTestServices: false }, (register) => {
  register('reads through the shared database', effect, 'run')
})

- `bindings` (`Suite.Bindings`) are the `@effect/vitest` `it` methods you run under.
- `config` (`Suite.Config`) names the suite, picks the describe collector (`describe` | `skip` | `only`, `Suite.DescribeMode`), carries Vitest `options`, and optionally declares the whole suite live with `live: { reason }`.
- A live case carries a required reason instead of a boolean, so the run report can name every live case: `config` takes it as `live: { reason }` and a registration takes it as `register('waits on real I/O', effect, 'run', { reason: 'waits on a socket' })`; a case that waits on the kernel's test clock calls `TestClock.adjust` or `TestClock.setTime` inside its body.
- Each entry point hands `use` a registrar (`Suite.RegisterFn<B, E, R>`); the registrar's body and error channels are yours to declare, and its requirement channel is the union of the layer services it hands you. A shared layer is acquired once for the whole suite; a per-case layer is acquired and finalized around every case.
- `register` mode is `Suite.RegisterMode` (`'run' | 'skip' | 'only'`).

## TaskRef

`TaskRef.provideTaskRef(effect, ctx)` makes the running Vitest task context available to a case body:

- `TaskRef.RawVitestTaskRef` hands the context over in whatever form the test runner passes it, including a callable context.
- `TaskRef.VitestTaskRef` carries it only when it is a plain object; otherwise it holds `null`.

## Install

```bash
pnpm add @systemfsoftware/effect-spec-runtime@workspace:^
````

> [!NOTE]
> `effect`, `@effect/vitest`, and `vitest` are peer dependencies — you bring your own.
