# @systemfsoftware/effect-spec-runtime

The registrar core behind Effect spec harnesses: describe/it selection and the Vitest task reference, with error and body types as parameters. `@systemfsoftware/effect-gherkin-spec` is built on it.

The package exports two namespace barrels:

```ts
import { Suite, TaskRef } from '@systemfsoftware/effect-spec-runtime'
```

## Suite

`Suite.open` registers a suite with no layer, `Suite.openShared` adds a layer shared by the whole suite, `Suite.openCase` adds a layer acquired fresh around every case, and `Suite.openSharedCase` does both:

```ts
import { layer } from '@effect/vitest'

Suite.openShared(bindings, config, { layer: DatabaseFixture, excludeTestServices: false }, (register) => {
  register('reads through the shared database', effect, 'run')
})
```

- `bindings` (`Suite.Bindings`) are the `@effect/vitest` `it` methods and `layer` helper you run under.
- `config` (`Suite.Config`) names the suite, picks the describe collector (`describe` | `skip` | `only`, `Suite.DescribeMode`), carries Vitest `options`, and sets `liveClock` to choose between the test-clock and live-clock case runners.
- Each entry point hands `use` a registrar (`Suite.RegisterFn<B, E, R>`); the registrar's body and error channels are yours to declare, and its requirement channel is the union of the layer services it hands you. A shared layer is acquired once for the whole suite; a per-case layer is acquired and finalized around every case.
- `register` mode is `Suite.RegisterMode` (`'run' | 'skip' | 'only'`).

## TaskRef

`TaskRef.provideTaskRef(effect, ctx)` makes the running Vitest task context available to a case body:

- `TaskRef.RawVitestTaskRef` hands the context over in whatever form the test runner passes it, including a callable context.
- `TaskRef.VitestTaskRef` carries it only when it is a plain object; otherwise it holds `null`.

## Install

```bash
pnpm add @systemfsoftware/effect-spec-runtime@workspace:^
```

> [!NOTE]
> `effect`, `@effect/vitest`, and `vitest` are peer dependencies — you bring your own.
