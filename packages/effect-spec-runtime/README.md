# @systemfsoftware/effect-spec-runtime

The registrar and kernel-case core behind Effect spec harnesses: every case runs under the simulation kernel by default (the zero-preemption schedule, then the profile's seeded schedules), a case that must stay on the live clock declares itself with a required reason, and a failure reports the seed and decision path that `CONFORMANCE_REPLAY` reproduces. `@systemfsoftware/effect-gherkin-spec` is built on it.

The package exports three namespace barrels:

```ts
import { KernelCase, Suite, TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect } from 'effect'
```

## KernelCase

`KernelCase.caseProgram(body, env)` builds a case whose layers are rebuilt fresh around every run and whose body runs under the kernel's test clock; `KernelCase.liveCase(body, env, reason)` is the live-clock counterpart and announces the reason on the run report, so every live case is listed with why it stayed live.

## Suite

`Suite.open` registers a suite with no layer, `Suite.openShared` adds a layer shared by the whole suite, `Suite.openCase` adds a layer acquired fresh around every case, and `Suite.openSharedCase` does both:

```ts
Suite.openShared(bindings, config, { layer: DatabaseFixture }, (register) => {
  register(
    'reads through the shared database',
    (expect) =>
      Effect.gen(function*() {
        const row = yield* DatabaseFixture.read()
        yield* expect(row).toEqual('the stored row')
      }),
    'run',
  )
})
```

- `bindings` (`Suite.Bindings`) are the `@systemfsoftware/vitest` `it` methods you run under. Every case is registered as a generator body, so the test's own `expect` is the case's and each check is yielded: `it(name, function* ({ expect }) { … })`.
- A scenario is the expect-taking run — `Suite.Scenario<B, E, R>` is `(expect: Expect) => Effect<B, E, R | Scope | Asserted>` — and the registrar (`Suite.RegisterFn<B, E, R>`) calls it inside the case body, so a library that writes a flow reaches the test's check callback instead of importing an `expect`.
- `config` (`Suite.Config`) names the suite, picks the describe collector (`describe` | `skip` | `only`, `Suite.DescribeMode`), carries Vitest `options`, and optionally declares the whole suite live with `live: { reason }`.
- A live case carries a required reason instead of a boolean, so the run report can name every live case: `config` takes it as `live: { reason }` and a registration takes it as `register('waits on real I/O', (expect) => program, 'run', { reason: 'waits on a socket' })`; a case that waits on the kernel's test clock calls `TestClock.adjust` or `TestClock.setTime` inside its body.
- A case without a live declaration is registered on the kernel lane with `Register.UNTIMED`: every run is bounded in steps, so no wall-clock timeout applies.
- Each entry point hands `use` a registrar (`Suite.RegisterFn<B, E, R>`); the registrar's body and error channels are yours to declare, and its requirement channel is the union of the layer services it hands you. A shared layer is acquired once for the whole suite; a per-case layer is acquired and finalized around every case.
- `register` mode is `Suite.RegisterMode` (`'run' | 'skip' | 'only'`).

`Register.exploredProgram(program)` is the kernel run of one case's program: it re-provides the test's binding onto the program (so the checks the kernel runs count for this test), scopes the run, and reports a failure with its seed and decision path.

## TaskRef

`TaskRef.provideTaskRef(effect, ctx)` makes the running Vitest task context available to a case body:

- `TaskRef.RawVitestTaskRef` hands the context over in whatever form the test runner passes it, including a callable context.
- `TaskRef.VitestTaskRef` carries it only when it is a plain object; otherwise it holds `null`.

## Install

```bash
pnpm add @systemfsoftware/effect-spec-runtime@workspace:^
```

> [!NOTE]
> `effect`, `@systemfsoftware/vitest`, and `vitest` are peer dependencies — you bring your own.
